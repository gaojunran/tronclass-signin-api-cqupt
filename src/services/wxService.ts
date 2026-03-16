/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */

// Cached access_token
let cachedAccessToken: string | null = null;
let accessTokenExpiresAt = 0;

// Cached jsapi_ticket
let cachedJsapiTicket: string | null = null;
let jsapiTicketExpiresAt = 0;

function getWxConfig() {
  const appId = Deno.env.get("WX_APP_ID");
  const appSecret = Deno.env.get("WX_APP_SECRET");
  if (!appId || !appSecret) {
    throw new Error("WX_APP_ID and WX_APP_SECRET must be set in environment variables");
  }
  return { appId, appSecret };
}

/**
 * Generate a random nonce string.
 */
function generateNonceStr(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * SHA-1 hash using Web Crypto API.
 */
async function sha1(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class WxService {
  /**
   * Get a valid access_token, using cache when possible.
   * See: https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html
   */
  static async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedAccessToken && now < accessTokenExpiresAt) {
      return cachedAccessToken;
    }

    const { appId, appSecret } = getWxConfig();
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch access_token: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.errcode) {
      throw new Error(`WeChat API error: ${data.errcode} ${data.errmsg}`);
    }

    cachedAccessToken = data.access_token as string;
    // Refresh 5 minutes before actual expiry to be safe
    accessTokenExpiresAt = now + (data.expires_in - 300) * 1000;

    console.log("[wx] access_token refreshed, expires_in:", data.expires_in);
    return cachedAccessToken;
  }

  /**
   * Get a valid jsapi_ticket, using cache when possible.
   * See: https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
   */
  static async getJsapiTicket(): Promise<string> {
    const now = Date.now();
    if (cachedJsapiTicket && now < jsapiTicketExpiresAt) {
      return cachedJsapiTicket;
    }

    const accessToken = await WxService.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch jsapi_ticket: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`WeChat API error: ${data.errcode} ${data.errmsg}`);
    }

    cachedJsapiTicket = data.ticket as string;
    // Refresh 5 minutes before actual expiry to be safe
    jsapiTicketExpiresAt = now + (data.expires_in - 300) * 1000;

    console.log("[wx] jsapi_ticket refreshed, expires_in:", data.expires_in);
    return cachedJsapiTicket;
  }

  /**
   * Generate JS-SDK signature for a given URL.
   *
   * Signature algorithm:
   * 1. Sort fields by ASCII order: jsapi_ticket, noncestr, timestamp, url
   * 2. Concatenate as key1=value1&key2=value2...
   * 3. SHA-1 hash the result string
   */
  static async getJsSdkConfig(url: string): Promise<{
    appId: string;
    timestamp: number;
    nonceStr: string;
    signature: string;
  }> {
    const { appId } = getWxConfig();
    const jsapiTicket = await WxService.getJsapiTicket();
    const nonceStr = generateNonceStr();
    const timestamp = Math.floor(Date.now() / 1000);

    // Build string1 with fields sorted by ASCII order (dictionary order)
    // jsapi_ticket < noncestr < timestamp < url
    const string1 = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;

    const signature = await sha1(string1);

    return {
      appId,
      timestamp,
      nonceStr,
      signature,
    };
  }
}
