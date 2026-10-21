// Direct JSON-RPC to the running extension, bypassing a session's frozen tool list.
// Usage: node scripts/tb-rpc.cjs list | node scripts/tb-rpc.cjs <tool> '<json args>'
// The bearer token is read from connection.json and never printed.
const fs = require("fs");
const http = require("http");
const { port, token } = JSON.parse(fs.readFileSync("/tmp/thunderbird-mcp/connection.json", "utf8"));
const [cmd, rawArgs] = process.argv.slice(2);
const body = cmd === "list"
  ? { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
  : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: cmd, arguments: JSON.parse(rawArgs || "{}") } };
const data = JSON.stringify(body);
const req = http.request({ host: "127.0.0.1", port, path: "/", method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), Authorization: `Bearer ${token}` } }, res => {
  let out = "";
  res.on("data", d => out += d);
  res.on("end", () => {
    const msg = JSON.parse(out);
    if (cmd === "list") { console.log(msg.result.tools.map(t => t.name).join(" ")); return; }
    if (msg.error) { console.log("RPC ERROR", JSON.stringify(msg.error)); return; }
    const text = msg.result?.content?.[0]?.text;
    console.log(text ?? JSON.stringify(msg.result));
  });
});
req.setTimeout(240000, () => { console.log("TIMEOUT"); req.destroy(); });
req.on("error", e => console.log("HTTP ERROR", e.message));
req.end(data);
