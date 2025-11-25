// 用户类型
export interface User {
  id: string;
  name: string;
  is_auto: boolean;
  created_at: Date;
}

// Cookie类型
export interface Cookie {
  id: string;
  user_id: string;
  value: string;
  expires: Date | null;
  created_at: Date;
}

// 带有最新Cookie的用户类型
export interface UserWithCookie extends User {
  latest_cookie: string | null;
  expires: Date | null;
}

// 扫码历史类型
export interface ScanHistory {
  id: string;
  result: string;
  user_id: string | null;
  created_at: Date;
}

// 签到历史类型
export interface SigninHistory {
  id: string;
  user_id: string;
  cookie: string | null;
  scan_history_id: string | null;
  request_data: any | null;
  response_code: number | null;
  response_data: any | null;
  created_at: Date;
}

// 日志类型
export interface Log {
  id: string;
  action: string;
  data: any;
  created_at: Date;
}

// API请求类型
export interface AddUserRequest {
  ua_info: string;
  name: string;
}

export interface RemoveUserRequest {
  ua_info: string;
}

export interface RenameUserRequest {
  ua_info: string;
  new_name: string;
}

export interface RefreshCookieRequest {
  ua_info: string;
  cookie: string;
}

export interface SetAutoRequest {
  ua_info: string;
  is_auto: boolean;
}

export interface SigninRequest {
  ua_info: string;
  scan_result: string;
  user_id?: string;
}

export interface DigitalSigninRequest {
  ua_info: string;
  data?: string;
  user_id?: string;
}

// API响应类型
export interface AddUserResponse {
  id: string;
}

export interface SigninResponse {
  scan_result: ScanHistory;
  signin_results: SigninHistory[];
}

// 解析扫码结果返回的类型
export interface ParsedScanResult {
  courseId?: string;
  activityId?: string;
  activityType?: string;
  data?: string;
  rollcallId?: string;
  groupSetId?: string;
  accessCode?: string;
  action?: string;
  enableGroupRollcall?: string;
  createUser?: string;
  joinCourse?: string;
}
