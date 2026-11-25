import { describe, expect, it } from "vitest";

import { ReadOnlySafetyPolicy } from "../src/ax.js";

const policy = new ReadOnlySafetyPolicy();

describe("read-only safety policy", () => {
  it.each([
    "Buy now",
    "Unsubscribe",
    "Sign out",
    "Log out",
    "Enable notifications",
    "Disable notifications",
    "Redeem code",
    "Claim reward",
    "Bind account",
    "Change password",
    'AXButton "Share"',
    'AXButton "Order"',
    'AXButton "Toggle"',
    'AXButton "Toggle favorite"',
    'AXButton "Place order"',
    'AXButton "Sign Out"',
    "sign_out",
    "sign_out_button",
    "Sign-Out",
    "AXSecureTextField Password",
  ])("blocks %s", (description) => {
    expect(policy.allows(description)).toBe(false);
  });

  it.each(["分享", "预约", "预订", "开启", "关闭", "绑定", "兑换", "领取"])(
    "blocks the Chinese write label %s",
    (description) => {
      expect(policy.allows(description)).toBe(false);
    },
  );

  it.each([
    "Open report",
    "Learn more",
    "8 link Learn more",
    "AXLink Contact",
    "Search",
    'AXButton "Toggle navigation"',
    'AXButton "Share price"',
    'AXButton "Order book"',
    'AXButton "Market update"',
    "已预约",
    "已分享",
    "已关闭",
    "已绑定",
  ])(
    "keeps the read-only navigation %s",
    (description) => {
      expect(policy.allows(description)).toBe(true);
    },
  );
});
