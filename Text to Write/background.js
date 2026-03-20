// Clicking the toolbar button toggles the sidebar
browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
