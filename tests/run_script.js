// Usage: node tests/run_script.js <file.js> [--render <documentUuid> <spreadIndex> <out.png>]
// Requires Affinity running with the MCP bridge enabled at http://localhost:6767/sse.
// Reads the preamble (required by MCP), executes the script inside Affinity and prints console output.
const fs = require('node:fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { CallToolResultSchema } = require('@modelcontextprotocol/sdk/types.js');

async function call(client, name, args) {
  return client.request({ method: 'tools/call', params: { name, arguments: args } }, CallToolResultSchema, { timeout: 600000 });
}

(async () => {
  const file = process.argv[2];
  const renderIdx = process.argv.indexOf('--render');
  const client = new Client({ name: 'run-script', version: '1.0.0' });
  const transport = new SSEClientTransport(new URL('http://localhost:6767/sse'));
  try {
    await client.connect(transport);
    await call(client, 'read_sdk_documentation_topic', { filename: 'preamble' });
    if (file) {
      const res = await call(client, 'execute_script', { script: fs.readFileSync(file, 'utf8') });
      for (const c of res.content || []) {
        if (c.type === 'text') console.log(c.text);
        else console.log('[' + c.type + ']');
      }
      if (res.isError) process.exitCode = 1;
    }
    if (renderIdx > 0) {
      const [uuid, spreadIndex, out] = process.argv.slice(renderIdx + 1);
      const res = await call(client, 'render_spread', { document_session_uuid: uuid, spread_index: Number(spreadIndex) });
      for (const c of res.content || []) {
        if (c.type === 'image') { fs.writeFileSync(out, Buffer.from(c.data, 'base64')); console.log('saved', out); }
        else if (c.type === 'text') console.log(c.text);
      }
    }
  } finally {
    await transport.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
