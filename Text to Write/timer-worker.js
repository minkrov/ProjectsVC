// Runs in a Web Worker — exempt from background-tab timer throttling.
// Receives { id, ms } and posts { id } back after ms milliseconds.
self.onmessage = function (e) {
  var id = e.data.id;
  var ms = e.data.ms;
  setTimeout(function () { self.postMessage({ id: id }); }, ms);
};
