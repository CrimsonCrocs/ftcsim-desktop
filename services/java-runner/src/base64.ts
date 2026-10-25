/**
 * Validate standard base64 without a regular expression. JavaScriptCore may
 * return false for an otherwise valid match when the input is tens of MiB.
 */
export function isStandardBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  let dataEnd = value.length;
  if (value.endsWith("==")) dataEnd -= 2;
  else if (value.endsWith("=")) dataEnd -= 1;
  for (let index = 0; index < dataEnd; index += 1) {
    const code = value.charCodeAt(index);
    const alphanumeric = (code >= 0x30 && code <= 0x39)
      || (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a);
    if (!alphanumeric && code !== 0x2b && code !== 0x2f) return false;
  }
  for (let index = dataEnd; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 0x3d) return false;
  }
  return true;
}
