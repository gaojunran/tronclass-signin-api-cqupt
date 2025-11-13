// 定义特殊字符
const ta = String.fromCharCode(30);
const ea = String.fromCharCode(31);
const na = String.fromCharCode(26);
const ra = String.fromCharCode(16);
const ia = na + "1";
const oa = na + "0";

// 辅助函数：将整数转换为 base36 字符串
function toBase36(num: number): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  if (num < 0) {
    return "-" + toBase36(-num);
  } else if (num < 36) {
    return chars[num];
  } else {
    let result = "";
    let currentNum = num;
    while (currentNum > 0) {
      const rem = currentNum % 36;
      result = chars[rem] + result;
      currentNum = Math.floor(currentNum / 36);
    }
    return result;
  }
}

// aa 对应的对象，key 为各字段名，value 为 index 转换成 base36 后的字符串
const aa: Record<string, string> = {
  courseId: toBase36(0),
  activityId: toBase36(1),
  activityType: toBase36(2),
  data: toBase36(3),
  rollcallId: toBase36(4),
  groupSetId: toBase36(5),
  accessCode: toBase36(6),
  action: toBase36(7),
  enableGroupRollcall: toBase36(8),
  createUser: toBase36(9),
  joinCourse: toBase36(10),
};

// ua 对应的对象，key 为各字段名，value 为 na 加上 (index+2) 转为 base36 的字符串
const ua: Record<string, string> = {
  "classroom-exam": na + toBase36(2),
  feedback: na + toBase36(3),
  vote: na + toBase36(4),
};

// ca 为 aa 的键值对反转后的字典
const ca: Record<string, string> = {};
Object.entries(aa).forEach(([key, value]) => {
  ca[value] = key;
});

// sa 为 ua 的键值对反转后的字典
const sa: Record<string, string> = {};
Object.entries(ua).forEach(([key, value]) => {
  sa[value] = key;
});

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

/**
 * 解析字符串 t，将其按照分隔符处理后，返回一个字典对象。
 * 
 * 分隔逻辑：
 *   - 首先以 "!" 分割字符串，再过滤掉空项
 *   - 对每一段，再以 "~" 分割为 key 和 value 两部分
 *   - key 使用 ca 映射（若存在对应关系），否则原样使用
 *   - value 的处理：
 *       * 如果以 na 开头：
 *           - 若等于 ia，则返回 True
 *           - 否则若不等于 oa，则返回 sa 映射中的值（若存在），否则原样返回
 *           - 若等于 oa，则返回 False
 *       * 如果以 ra 开头：
 *           - 截取 ra 之后的部分，用 "." 分割，然后将每部分以 base36 转换为整数
 *           - 若转换后的列表长度大于1，则取前两项拼接成浮点数返回，否则返回该整数
 *       * 其它情况：
 *           - 替换 value 中所有 ea 为 "~"，所有 ta 为 "!"
 */
export function parseSignQrCode(t: string): ParsedScanResult {
  const result: ParsedScanResult = {};
  
  if (t && typeof t === 'string') {
    // 使用 "!" 分割并过滤空字符串
    const parts = t.split("!").filter(part => part.length > 0);
    
    for (const part of parts) {
      const splitted = part.split("~", 1); // 仅分割成两部分
      if (splitted.length >= 2) {
        const r = splitted[0];
        const i = splitted[1];
        const key = ca[r] || r;
        
        // 处理 value
        let value: any;
        
        if (i.startsWith(na)) {
          if (i === ia) {
            value = true;
          } else if (i !== oa) {
            value = sa[i] || i;
          } else {
            value = false;
          }
        } else if (i.startsWith(ra)) {
          const parts_ = i.substring(1).split(".");
          try {
            const nums = parts_.map(part => parseInt(part, 36));
            if (nums.length > 1) {
              value = parseFloat(`${nums[0]}.${nums[1]}`);
            } else if (nums.length === 1) {
              value = nums[0];
            } else {
              value = i;
            }
          } catch {
            value = i;
          }
        } else {
          value = i.replace(new RegExp(ea, 'g'), "~").replace(new RegExp(ta, 'g'), "!");
        }
        
        (result as any)[key] = value;
      }
    }
  }
  
  return result;
}

// 测试函数
if (import.meta.main) {
  const testResult = parseSignQrCode(
    "/j?p=0~\\u00101zxy!3~1762926889fcb9acd6a8f3645f4743f5f7094c238a!4~\\u0010cpu7"
  );
  console.log("测试结果:", testResult);
}
