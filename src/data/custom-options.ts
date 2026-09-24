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

export const CUSTOM_CONFIGS: Record<string, CustomConfig> = {
  // 粤式手作糖水
  "yue-shi-shou-zuo-tang-shui": {
    dishId: "yue-shi-shou-zuo-tang-shui",
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
  "zhu-chu-ding-zhi-shui-zhu-qing-shi-pin": {
    dishId: "zhu-chu-ding-zhi-shui-zhu-qing-shi-pin",
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
  "yuan-zhi-shui-zhu-gu-si-fei-niu-shan": {
    dishId: "yuan-zhi-shui-zhu-gu-si-fei-niu-shan",
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
  "hei-jiao-di-ka-shui-zhu-xian-nen-ji-tui-rou": {
    dishId: "hei-jiao-di-ka-shui-zhu-xian-nen-ji-tui-rou",
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
  "xian-xia-shi-shu-gao-dan-bai-qing-shi-shan": {
    dishId: "xian-xia-shi-shu-gao-dan-bai-qing-shi-shan",
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
