export type CustomConfig = {
  dishId: string;
  title: string;
  subtitle: string;
  groups: {
    id: string;
    name: string;
    type: "single" | "multiple";
    required?: boolean;
    min?: number;
    options: string[];
  }[];
  defaultValues: Record<string, string | string[]>;
};

type Group = CustomConfig["groups"][number];

function pick(
  id: string,
  name: string,
  options: string[],
  type: Group["type"] = "multiple",
): Group {
  return { id, name, type, options };
}

/** 偷个懒条目：选项全部非必选、不默认勾选；分组名用门店菜单的叫法 */
function lazy(dishId: string, name: string, subtitle: string, groups: Group[]): CustomConfig {
  return { dishId, title: name, subtitle, groups, defaultValues: {} };
}

/** 奶茶店通用的甜度和冰量，平时喝全糖少冰，排在第一个 */
const TEA_GROUPS: Group[] = [
  pick("sugar", "甜度", ["全糖", "七分糖", "五分糖", "三分糖", "不另外加糖"], "single"),
  pick("ice", "冰量", ["少冰", "正常冰", "去冰", "常温", "热"], "single"),
];

export const CUSTOM_CONFIGS: Record<string, CustomConfig> = {
  // 粤式手作糖水
  "79": {
    dishId: "79",
    title: "粤式手作糖水 · 随心定制",
    subtitle: "冷热双选，牛乳生椰双底，现熬小料温润滋养",
    groups: [
      {
        id: "temp",
        name: "赏味温度",
        type: "single",
        required: true,
        options: ["热", "去冰", "少冰"],
      },
      {
        id: "base",
        name: "基底风味",
        type: "single",
        required: true,
        options: ["鲜纯牛乳", "生椰原汁"],
      },
      {
        id: "toppings",
        name: "臻手作小料",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "手作厚芋泥",
          "现熬晶莹西米",
          "Q弹清爽脆波波",
          "软糯慢熬蜜红豆",
          "爽脆原汁椰果",
        ],
      },
    ],
    defaultValues: {
      temp: "热",
      base: "鲜纯牛乳",
      toppings: ["手作厚芋泥", "现熬晶莹西米", "Q弹清爽脆波波"],
    },
  },

  // 主厨定制水煮轻食拼
  "86": {
    dishId: "86",
    title: "主厨定制水煮轻食拼 · 私享自选",
    subtitle: "高蛋白与鲜蔬菌菇随心搭配，特调低卡捞汁",
    groups: [
      {
        id: "protein",
        name: "严选高蛋白",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "原切谷饲肥牛卷",
          "鲜嫩去皮鸡腿肉",
          "鲜甜大虾仁",
          "溏心慢熟蛋",
        ],
      },
      {
        id: "staple",
        name: "慢碳主食",
        type: "multiple",
        options: [
          "水果甜玉米段",
          "蜜甜蒸红薯",
          "五谷糙米杂粮饭",
          "精选东北白米饭",
        ],
      },
      {
        id: "veggies",
        name: "鲜蔬菌菇汇",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "脆嫩西蓝花",
          "清甜西葫芦",
          "原切胡萝卜",
          "脆爽荷兰豆",
          "原生脆口蘑",
          "鲜脆金针菇",
          "爽口黑木耳",
          "嫩脆四季豆",
        ],
      },
      {
        id: "sauce",
        name: "特调灵魂捞汁",
        type: "single",
        required: true,
        options: [
          "秘制蒜香生抽捞汁",
          "焙煎芝麻沙拉汁",
          "原味海盐黑胡椒",
        ],
      },
    ],
    defaultValues: {
      protein: ["原切谷饲肥牛卷", "溏心慢熟蛋"],
      staple: ["水果甜玉米段"],
      veggies: ["脆嫩西蓝花", "清甜西葫芦", "原生脆口蘑"],
      sauce: "秘制蒜香生抽捞汁",
    },
  },

  // 原汁水煮谷饲肥牛膳
  "87": {
    dishId: "87",
    title: "原汁水煮谷饲肥牛膳 · 经典定制",
    subtitle: "肥牛焯烫去油奶香四溢，搭配清甜玉米与脆蔬",
    groups: [
      {
        id: "protein",
        name: "严选高蛋白",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "原切谷饲肥牛卷",
          "鲜嫩去皮鸡腿肉",
          "鲜甜大虾仁",
          "溏心慢熟蛋",
        ],
      },
      {
        id: "staple",
        name: "慢碳主食",
        type: "multiple",
        options: [
          "水果甜玉米段",
          "蜜甜蒸红薯",
          "五谷糙米杂粮饭",
          "精选东北白米饭",
        ],
      },
      {
        id: "veggies",
        name: "鲜蔬菌菇汇",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "脆嫩西蓝花",
          "清甜西葫芦",
          "原切胡萝卜",
          "脆爽荷兰豆",
          "原生脆口蘑",
          "鲜脆金针菇",
          "爽口黑木耳",
          "嫩脆四季豆",
        ],
      },
      {
        id: "sauce",
        name: "特调灵魂捞汁",
        type: "single",
        required: true,
        options: [
          "秘制蒜香生抽捞汁",
          "焙煎芝麻沙拉汁",
          "原味海盐黑胡椒",
        ],
      },
    ],
    defaultValues: {
      protein: ["原切谷饲肥牛卷"],
      staple: ["水果甜玉米段"],
      veggies: ["脆嫩西蓝花", "清甜西葫芦", "鲜脆金针菇"],
      sauce: "秘制蒜香生抽捞汁",
    },
  },

  // 黑椒低卡水煮鲜嫩鸡腿肉
  "88": {
    dishId: "88",
    title: "黑椒低卡水煮嫩鸡腿 · 经典定制",
    subtitle: "去皮鸡腿多汁不柴，黑胡椒提鲜，粗粮主食饱腹",
    groups: [
      {
        id: "protein",
        name: "严选高蛋白",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "鲜嫩去皮鸡腿肉",
          "原切谷饲肥牛卷",
          "鲜甜大虾仁",
          "溏心慢熟蛋",
        ],
      },
      {
        id: "staple",
        name: "慢碳主食",
        type: "multiple",
        options: [
          "五谷糙米杂粮饭",
          "水果甜玉米段",
          "蜜甜蒸红薯",
          "精选东北白米饭",
        ],
      },
      {
        id: "veggies",
        name: "鲜蔬菌菇汇",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "脆爽荷兰豆",
          "原切胡萝卜",
          "原生脆口蘑",
          "脆嫩西蓝花",
          "清甜西葫芦",
          "鲜脆金针菇",
          "爽口黑木耳",
          "嫩脆四季豆",
        ],
      },
      {
        id: "sauce",
        name: "特调灵魂捞汁",
        type: "single",
        required: true,
        options: [
          "原味海盐黑胡椒",
          "秘制蒜香生抽捞汁",
          "焙煎芝麻沙拉汁",
        ],
      },
    ],
    defaultValues: {
      protein: ["鲜嫩去皮鸡腿肉"],
      staple: ["五谷糙米杂粮饭"],
      veggies: ["脆爽荷兰豆", "原切胡萝卜", "原生脆口蘑"],
      sauce: "原味海盐黑胡椒",
    },
  },

  // 鲜虾时蔬高蛋白轻食膳
  "89": {
    dishId: "89",
    title: "鲜虾时蔬高蛋白轻食膳 · 经典定制",
    subtitle: "鲜甜大虾仁搭配溏心蛋与黑木耳，芝麻汁提香",
    groups: [
      {
        id: "protein",
        name: "严选高蛋白",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "鲜甜大虾仁",
          "溏心慢熟蛋",
          "原切谷饲肥牛卷",
          "鲜嫩去皮鸡腿肉",
        ],
      },
      {
        id: "staple",
        name: "慢碳主食",
        type: "multiple",
        options: [
          "水果甜玉米段",
          "蜜甜蒸红薯",
          "五谷糙米杂粮饭",
          "精选东北白米饭",
        ],
      },
      {
        id: "veggies",
        name: "鲜蔬菌菇汇",
        type: "multiple",
        required: true,
        min: 1,
        options: [
          "脆嫩西蓝花",
          "清甜西葫芦",
          "原切胡萝卜",
          "脆爽荷兰豆",
          "原生脆口蘑",
          "鲜脆金针菇",
          "爽口黑木耳",
          "嫩脆四季豆",
        ],
      },
      {
        id: "sauce",
        name: "特调灵魂捞汁",
        type: "single",
        required: true,
        options: [
          "焙煎芝麻沙拉汁",
          "秘制蒜香生抽捞汁",
          "原味海盐黑胡椒",
        ],
      },
    ],
    defaultValues: {
      protein: ["鲜甜大虾仁", "溏心慢熟蛋"],
      staple: [],
      veggies: ["脆嫩西蓝花", "爽口黑木耳", "嫩脆四季豆"],
      sauce: "焙煎芝麻沙拉汁",
    },
  },

  // ───────── 偷个懒：爱点的菜，打开再勾，都不默认选 ─────────
  "110": lazy("110", "海底捞", "涮菜任选", [
    pick("dishes", "涮菜", ["牛肉", "嫩豆皮", "海带苗", "贡菜", "蟹柳", "毛肚"]),
  ]),
  "113": lazy("113", "烧烤", "烤串任选", [
    pick("dishes", "烤串", [
      "烤鸡翅",
      "五花肉",
      "小黄鱼",
      "牛肉串",
      "鸡脆骨",
      "烤韭菜",
      "烤茄子",
      "蒜蓉花甲",
    ]),
  ]),
  "114": lazy("114", "鸭脖", "绝味 / 周黑鸭", [
    pick("shop", "门店", ["绝味鸭脖", "周黑鸭"], "single"),
  ]),
  "115": lazy("115", "肯德基", "单品任选", [
    pick("dishes", "单品", ["香辣鸡翅", "圣代"]),
  ]),
  "117": lazy("117", "临榆炸鸡腿", "甘梅味", [
    pick("dishes", "单品", ["炸鸡腿", "炸鸡翅"]),
  ]),
  "120": lazy("120", "蜜雪冰城", "全糖少冰", [
    pick("drinks", "饮品", ["柠檬水", "蜜桃四季春", "芝士奶盖四季春"]),
    ...TEA_GROUPS,
  ]),
  "121": lazy("121", "喜茶", "全糖少冰", [
    pick("drinks", "饮品", ["黑糖奶茶", "咸酪碎银子"]),
    ...TEA_GROUPS,
  ]),
  "122": lazy("122", "茶百道", "全糖少冰", [
    pick("drinks", "饮品", ["豆乳玉麒麟"]),
    ...TEA_GROUPS,
  ]),
  "123": lazy("123", "好利来", "蛋糕任选", [
    pick("cakes", "蛋糕", ["草莓蛋糕"]),
  ]),
};

export function formatCustomSummary(
  dishId: string,
  selected: Record<string, string | string[]>,
): string[] {
  const cfg = CUSTOM_CONFIGS[dishId];
  if (!cfg) return [];
  const tags: string[] = [];
  for (const g of cfg.groups) {
    const val = selected[g.id];
    if (!val) continue;
    if (Array.isArray(val) && val.length > 0) {
      tags.push(val.join("/"));
    } else if (typeof val === "string" && val) {
      tags.push(val);
    }
  }
  return tags;
}
