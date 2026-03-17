// Deploy to 192.168.68.76 (Boiler) AND 192.168.68.77 (Boiler Backup)
// Reflects Origin header so requests work from any origin, including file:// pages.

HTTPServer.registerEndpoint("status", function (request, response) {
  var origin = (request.headers && request.headers["Origin"]) || "*";

  if (request.method === "OPTIONS") {
    response.code = 204;
    response.headers = [
      ["Access-Control-Allow-Origin", origin],
      ["Access-Control-Allow-Methods", "GET, OPTIONS"],
      ["Vary", "Origin"],
    ];
    response.send();
    return;
  }

  Shelly.call("Shelly.GetStatus", {}, function (result, err) {
    response.code = err ? 500 : 200;
    response.headers = [
      ["Content-Type", "application/json"],
      ["Access-Control-Allow-Origin", origin],
      ["Vary", "Origin"],
    ];
    response.body = err ? JSON.stringify({ error: err }) : JSON.stringify(result);
    response.send();
  });
});
