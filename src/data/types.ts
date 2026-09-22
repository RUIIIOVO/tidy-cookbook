export type CategoryId = "meat" | "seafood" | "veggie" | "staple";

export type SubId =
  | "pork"
  | "beef"
  | "chicken"
  | "western"
  | "shrimp"
  | "fish"
  | "shellfish"
  | "crab"
  | "egg"
  | "tofu"
  | "greens"
  | "soup"
  | "staple";

export type IngredientGroup = {
  group: "主料" | "辅料" | "调料";
  items: { name: string; amount: string }[];
};

export type Dish = {
  id: string;
  name: string;
  desc: string;
  category: CategoryId;
  sub: SubId;
  spicy: 0 | 1 | 2 | 3;
  minutes: number;
  difficulty: 1 | 2 | 3;
  tags: string[];
  ingredients: IngredientGroup[];
  steps: string[];
  /** 全拼，用于搜索 */
  pinyin: string;
  /** 首字母，用于搜索 */
  initials: string;
  image: string;
};

export type Category = {
  id: CategoryId;
  name: string;
  subs: { id: SubId; name: string }[];
};
