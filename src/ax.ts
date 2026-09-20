import { createHash } from "node:crypto";

import type { ComputerElement, ComputerSnapshot, ElementOperation } from "./types.js";

const APP_INSTRUCTIONS = /<app_specific_instructions>[\s\S]*?<\/app_specific_instructions>/gi;
const PHONE = /(?<!\d)(1\d{2})\d{4}(\d{4})(?!\d)/g;
const EMAIL = /\b([\w.+-])[^@\s]*@([^\s.]+\.[^\s]+)\b/g;
const TOKEN = /\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g;
const COORDINATES = [
  /\b(?:frame|bounds|position|size)\s*[:=]\s*(?:\([^\n)]*\)|(?:\[[^\n\]]*\]){1,4}|\{[^\n}]*\}|[^\n,;]+)/gi,
  /\b[xy]\s*[:=]\s*-?\d+(?:\.\d+)?/gi,
];
const INDEX_PATTERNS = [
  /\belement_index\s*[:=]\s*["']?(\d+)/i,
  /\belementIndex\s*[:=]\s*["']?(\d+)/i,
  /\bindex\s*[:=]\s*["']?(\d+)/i,
  /\[(?:element[_ ]?index\s*[:=]\s*)?(\d+)]/i,
  /^\s*(\d+)[).:]\s+(?=(?:AX)?[A-Za-z])/,
] as const;
const SCROLLABLE = /\b(?:AXScrollArea|scrollable|scroll area|scrollview|scroll view)\b/i;
const PASSWORD = /\b(?:AXSecureTextField|secure text|password|密码|口令)\b/i;

export class ReadOnlySafetyPolicy {
  static readonly blockedText = new RegExp([
    [
      "购买", "支付", "付款", "下单", "交易", "订阅", "关注", "取消关注", "删除", "注销",
      "退出登录", "保存", "提交", "确认", "确定", "发送", "发布", "上传", "安装", "更新",
      "登录", "注册", "授权", "同意", "拒绝", "开启", "关闭", "修改密码", "绑定", "兑换", "领取",
    ].map(escapeRegex).join("|"),
    `\\b(?:${[
      "buy", "pay", "purchase", "checkout", "order", "trade", "subscribe", "follow", "unfollow",
      "delete", "remove", "logout", "save", "submit", "confirm", "send", "post", "publish", "upload",
      "install", "update", "login", "log in", "sign in", "register", "authorize", "allow", "deny",
      "accept", "agree", "change password", "share", "book", "reserve",
    ].map(escapeRegex).join("|")})\\b`,
  ].join("|"), "i");

  allows(description: string): boolean {
    return !PASSWORD.test(description) && !ReadOnlySafetyPolicy.blockedText.test(description);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(value: string): string {
  return value
    .replace(PHONE, "$1****$2")
    .replace(EMAIL, "$1***@$2")
    .replace(TOKEN, "<redacted>");
}

export function sanitizeAccessibilityText(value: string): string {
  let cleaned = value.replace(APP_INSTRUCTIONS, "");
  for (const pattern of COORDINATES) cleaned = cleaned.replace(pattern, "<geometry>");
  return redact(cleaned).replace(/\n{3,}/g, "\n\n").trim().slice(0, 64_000);
}

function elementIndex(line: string): number | null {
  for (const pattern of INDEX_PATTERNS) {
    const match = pattern.exec(line);
    if (match?.[1] !== undefined) return Number.parseInt(match[1], 10);
  }
  return null;
}

function candidateDescription(lines: readonly string[], lineNumber: number): string {
  const center = lines[lineNumber]?.trim() ?? "";
  const nearby: string[] = [];
  for (let offset = -2; offset <= 2; offset += 1) {
    const current = lines[lineNumber + offset]?.trim();
    if (!current) continue;
    if (offset !== 0 && elementIndex(current) !== null) continue;
    if (!nearby.includes(current)) nearby.push(current);
  }
  return sanitizeAccessibilityText(nearby.join(" · ") || center).slice(0, 600);
}

export function parseIndexedElements(
  accessibilityText: string,
  safety: ReadOnlySafetyPolicy = new ReadOnlySafetyPolicy(),
): ComputerElement[] {
  const lines = accessibilityText.replace(APP_INSTRUCTIONS, "").split(/\r?\n/);
  const elements = new Map<number, ComputerElement>();
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber] ?? "";
    const index = elementIndex(line);
    if (index === null || !Number.isSafeInteger(index) || index < 0 || elements.has(index)) continue;
    const description = candidateDescription(lines, lineNumber);
    if (!description || !safety.allows(description)) continue;
    const operations: ElementOperation[] = SCROLLABLE.test(description)
      ? ["SCROLL_DOWN", "SCROLL_UP", "SCROLL_LEFT", "SCROLL_RIGHT"]
      : ["CLICK"];
    elements.set(index, { index, description, operations });
    if (elements.size >= 200) break;
  }
  return [...elements.values()];
}

export function snapshotFromAccessibility(app: string, accessibilityText: string): ComputerSnapshot {
  if (!app.trim()) throw new TypeError("app must be a non-empty string");
  if (!accessibilityText.trim()) throw new Error("Computer Use returned an empty accessibility tree");
  return {
    app,
    accessibilityText,
    modelText: sanitizeAccessibilityText(accessibilityText),
    elements: parseIndexedElements(accessibilityText),
    fingerprint: createHash("sha256").update(accessibilityText).digest("hex"),
  };
}
