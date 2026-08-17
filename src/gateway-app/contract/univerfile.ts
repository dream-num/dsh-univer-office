// univerfile 的 base64url 编解码(跨 Node/浏览器一致,无依赖)。
// 服务端用 /uf/<enc> 寻址,enc = base64url(本地 .univer 绝对路径)。

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return binary;
}

/** 把 .univer 本地路径编成 /uf/<enc> 用的 enc(base64url,无填充)。 */
export function encodeUniverfile(path: string): string {
  const binary = bytesToBinary(new TextEncoder().encode(path));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 反解 enc 回路径(测试 / 调试用)。 */
export function decodeUniverfile(enc: string): string {
  const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
