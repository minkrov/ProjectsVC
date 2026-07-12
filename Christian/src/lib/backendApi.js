import { isSupabaseConfigured, supabase } from "./supabaseClient";

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  return supabase;
};

const requireUserId = (userId) => {
  if (!userId) {
    throw new Error("A signed-in user is required for this action.");
  }
};

const selectProfileColumns =
  "id, username, display_name, bio, tradition, favorite_verse, avatar_url, banner_url, banner_scale, avatar_border_color, selected_house_id, created_at, updated_at";

const compactObject = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );

export const authApi = {
  async getSession() {
    const client = requireSupabase();
    return client.auth.getSession();
  },

  onAuthStateChange(callback) {
    const client = requireSupabase();
    return client.auth.onAuthStateChange(callback);
  },

  async signUp({ email, password, displayName }) {
    const client = requireSupabase();
    return client.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });
  },

  async signIn({ email, password }) {
    const client = requireSupabase();
    return client.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    const client = requireSupabase();
    return client.auth.signOut();
  },
};

export const profileApi = {
  async getProfile(userId) {
    const client = requireSupabase();
    const query = client.from("profiles").select(selectProfileColumns).eq("id", userId).single();
    return query;
  },

  async updateProfile(userId, profile) {
    requireUserId(userId);

    const client = requireSupabase();
    const update = compactObject({
      username: profile.username,
      display_name: profile.displayName,
      bio: profile.bio,
      tradition: profile.tradition,
      favorite_verse: profile.favoriteVerse,
      avatar_url: profile.avatarUrl,
      banner_url: profile.bannerUrl,
      banner_scale: profile.bannerScale,
      avatar_border_color: profile.avatarBorderColor,
      selected_house_id: profile.selectedHouseId,
    });

    if (Object.keys(update).length === 0) {
      return profileApi.getProfile(userId);
    }

    return client
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .select(selectProfileColumns)
      .single();
  },

  async uploadProfileMedia(userId, file, mediaKind) {
    requireUserId(userId);

    if (!["avatar", "banner"].includes(mediaKind)) {
      throw new Error("Profile media kind must be avatar or banner.");
    }

    const client = requireSupabase();
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const filePath = `${userId}/${mediaKind}-${Date.now()}.${extension}`;
    const uploadResult = await client.storage.from("profile-media").upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

    if (uploadResult.error) {
      return uploadResult;
    }

    const { data } = client.storage.from("profile-media").getPublicUrl(filePath);
    return { data: { path: filePath, publicUrl: data.publicUrl }, error: null };
  },

  async removeProfileMedia(path) {
    if (!path) {
      return { data: null, error: null };
    }

    const client = requireSupabase();
    return client.storage.from("profile-media").remove([path]);
  },
};

export const feedApi = {
  async listPosts() {
    const client = requireSupabase();
    return client
      .from("posts")
      .select(`id, body, created_at, updated_at, author:profiles(${selectProfileColumns})`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
  },

  async createPost(userId, body) {
    requireUserId(userId);

    const client = requireSupabase();
    return client.from("posts").insert({ author_id: userId, body }).select("id, body, created_at").single();
  },

  async updatePost(postId, body) {
    const client = requireSupabase();
    return client.from("posts").update({ body }).eq("id", postId).select("id, body, updated_at").single();
  },

  async deletePost(postId) {
    const client = requireSupabase();
    return client.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
  },

  async listPostComments(postId) {
    const client = requireSupabase();
    return client
      .from("post_comments")
      .select(`id, post_id, body, created_at, updated_at, author:profiles(${selectProfileColumns})`)
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
  },

  async createPostComment(userId, postId, body) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("post_comments")
      .insert({ author_id: userId, post_id: postId, body })
      .select("id, body, created_at")
      .single();
  },
};

export const prayerApi = {
  async listPrayers() {
    const client = requireSupabase();
    return client.from("prayer_feed").select("*").order("created_at", { ascending: false });
  },

  async createPrayer(body, options = {}) {
    const client = requireSupabase();
    return client
      .from("prayers")
      .insert({
        body,
        is_anonymous: Boolean(options.isAnonymous),
        is_urgent: Boolean(options.isUrgent),
        is_answered: Boolean(options.isAnswered),
      })
      .select("id, body, created_at")
      .single();
  },

  async markPrayed(userId, prayerId) {
    requireUserId(userId);

    const client = requireSupabase();
    return client.from("prayer_prayed").insert({ user_id: userId, prayer_id: prayerId });
  },
};

export const discussionApi = {
  async listTopics() {
    const client = requireSupabase();
    return client.from("discussion_topics").select("*").order("sort_order", { ascending: true });
  },

  async listMessages(topicId) {
    const client = requireSupabase();
    return client
      .from("discussion_messages")
      .select(`id, topic_id, body, created_at, updated_at, author:profiles(${selectProfileColumns})`)
      .eq("topic_id", topicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
  },

  async createMessage(userId, topicId, body) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("discussion_messages")
      .insert({ author_id: userId, topic_id: topicId, body })
      .select("id, body, created_at")
      .single();
  },
};

export const houseApi = {
  async joinHouse(userId, houseId) {
    requireUserId(userId);

    const client = requireSupabase();
    const membership = await client
      .from("house_members")
      .upsert({ user_id: userId, house_id: houseId }, { onConflict: "house_id,user_id" });

    if (membership.error) {
      return membership;
    }

    return profileApi.updateProfile(userId, { selectedHouseId: houseId });
  },

  async listHousePosts(houseId) {
    const client = requireSupabase();
    return client
      .from("house_posts")
      .select(`id, house_id, body, created_at, updated_at, author:profiles(${selectProfileColumns})`)
      .eq("house_id", houseId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
  },

  async createHousePost(userId, houseId, body) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("house_posts")
      .insert({ author_id: userId, house_id: houseId, body })
      .select("id, body, created_at")
      .single();
  },
};

export const studyApi = {
  async createStudyLog(userId, { verseReference, verseText, translation = "WEB", thought }) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("bible_study_logs")
      .insert({
        user_id: userId,
        verse_reference: verseReference,
        verse_text: verseText,
        translation,
        thought,
      })
      .select("*")
      .single();
  },

  async listStudyLogs(userId) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("bible_study_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
  },
};

export const commonGroundApi = {
  async upsertReviewStep(userId, entry) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("common_ground_reviews")
      .upsert(
        {
          user_id: userId,
          review_date: entry.reviewDate,
          step_id: entry.stepId,
          title: entry.title,
          rating: entry.rating,
          note: entry.note || "",
        },
        { onConflict: "user_id,review_date,step_id" },
      )
      .select("*")
      .single();
  },

  async listReviews(userId) {
    requireUserId(userId);

    const client = requireSupabase();
    return client
      .from("common_ground_reviews")
      .select("*")
      .eq("user_id", userId)
      .order("review_date", { ascending: false })
      .order("created_at", { ascending: true });
  },
};
