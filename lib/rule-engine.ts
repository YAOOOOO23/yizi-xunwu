export type Point = { x: number; y: number };
export type Stroke = Point[];

export type RuleRound = {
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  basis: string;
};

export type RuleResult = {
  rounds: RuleRound[];
  ganzhiDay: string;
  hourBranch: string;
  detected: string[];
  engineVersion: "xunwu-0.2.0";
};

type StrokeKind = "dot" | "horizontal" | "vertical" | "left-fall" | "right-fall" | "curve" | "other";
type Trigram = "乾" | "坤" | "震" | "巽" | "坎" | "离" | "艮" | "兑";
type Element = "金" | "木" | "水" | "火" | "土";

const trigramInfo: Record<Trigram, { direction: string; nature: string; place: string }> = {
  乾: { direction: "西北", nature: "健", place: "较高、开阔或靠近外缘的位置" },
  坤: { direction: "西南", nature: "顺", place: "贴近地面、承托物或较低的位置" },
  震: { direction: "东", nature: "起", place: "刚被开启、移动或经常起落的位置" },
  巽: { direction: "东南", nature: "入", place: "缝隙、入口、容器内部或深入的位置" },
  坎: { direction: "北", nature: "陷", place: "凹陷、低处、孔洞或容易掉进去的位置" },
  离: { direction: "南", nature: "丽", place: "明亮、发热、电器或显眼物体附近" },
  艮: { direction: "东北", nature: "止", place: "边界、墙角、阻挡物或停止处" },
  兑: { direction: "西", nature: "泽", place: "开口、浅槽、潮湿处或金属器物附近" },
};

const elementPlaces: Record<Element, string> = {
  金: "金属、坚硬物、工具或带棱角的物体附近",
  木: "木质家具、长直物、架子或植物附近",
  水: "潮湿、低洼、流动路径或盛水容器附近",
  火: "灯、电器、热源或光亮位置附近",
  土: "地面、墙体、陶瓷、瓦器或厚重物附近",
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function describeStroke(stroke: Stroke): { kind: StrokeKind; centerY: number } {
  if (stroke.length < 2) return { kind: "dot", centerY: stroke[0]?.y ?? 0.5 };
  const start = stroke[0];
  const end = stroke[stroke.length - 1];
  let pathLength = 0;
  let minX = 1; let maxX = 0; let minY = 1; let maxY = 0;
  for (let index = 0; index < stroke.length; index += 1) {
    const point = stroke[index];
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    if (index > 0) pathLength += distance(stroke[index - 1], point);
  }
  const direct = distance(start, end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const width = maxX - minX;
  const height = maxY - minY;
  const centerY = (minY + maxY) / 2;

  if (pathLength < 0.13 && Math.max(width, height) < 0.11) return { kind: "dot", centerY };
  if (direct > 0.05 && pathLength / direct > 1.42) return { kind: "curve", centerY };
  if (Math.abs(dx) > Math.abs(dy) * 2.2 && Math.abs(dx) > 0.16) return { kind: "horizontal", centerY };
  if (Math.abs(dy) > Math.abs(dx) * 2.2 && Math.abs(dy) > 0.16) return { kind: "vertical", centerY };
  if (dx < -0.1 && dy > 0.12) return { kind: "left-fall", centerY };
  if (dx > 0.1 && dy > 0.12) return { kind: "right-fall", centerY };
  return { kind: "other", centerY };
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function hasCrossing(strokes: Stroke[]) {
  for (let first = 0; first < strokes.length; first += 1) {
    for (let second = first + 1; second < strokes.length; second += 1) {
      for (let a = 1; a < strokes[first].length; a += 1) {
        for (let b = 1; b < strokes[second].length; b += 1) {
          if (intersects(strokes[first][a - 1], strokes[first][a], strokes[second][b - 1], strokes[second][b])) return true;
        }
      }
    }
  }
  return false;
}

function detectTrigrams(character: string, strokes: Stroke[], kinds: ReturnType<typeof describeStroke>[]) {
  const counts = (kind: StrokeKind) => kinds.filter((item) => item.kind === kind).length;
  const candidates: Array<{ trigram: Trigram; score: number; basis: string }> = [];
  if (counts("dot") >= 3) candidates.push({ trigram: "坎", score: 5, basis: "三点同来方是坎" });
  if (counts("left-fall") >= 2) candidates.push({ trigram: "离", score: 5, basis: "撇如双见作离占" });
  if (counts("horizontal") >= 3) candidates.push({ trigram: "乾", score: 4, basis: "三画无伤乾亦然" });
  if (counts("right-fall") >= 1) candidates.push({ trigram: "乾", score: 3, basis: "捺为乾" });
  if (counts("left-fall") === 1) candidates.push({ trigram: "巽", score: 2, basis: "蛇形孤撇皆从巽" });
  if (["口", "兑", "兌"].includes(character)) candidates.push({ trigram: "兑", score: 5, basis: "口形为兑" });
  if (["云", "雲", "震"].includes(character)) candidates.push({ trigram: "震", score: 4, basis: "云首龙头震占先" });

  const horizontalYs = kinds.filter((item) => item.kind === "horizontal").map((item) => item.centerY);
  const verticalYs = kinds.filter((item) => item.kind === "vertical").map((item) => item.centerY);
  if (hasCrossing(strokes) && horizontalYs.length >= 2 && verticalYs.length >= 1) {
    const averageY = [...horizontalYs, ...verticalYs].reduce((sum, value) => sum + value, 0) / (horizontalYs.length + verticalYs.length);
    candidates.push({ trigram: averageY < 0.5 ? "艮" : "坤", score: 4, basis: averageY < 0.5 ? "土山居上名为艮" : "土山居下为坤" });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function detectElement(kinds: ReturnType<typeof describeStroke>[], crossing: boolean): { element: Element; score: number; basis: string } | null {
  const score: Record<Element, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  kinds.forEach(({ kind }) => {
    if (kind === "right-fall") score.金 += 2;
    if (kind === "vertical") score.木 += 2;
    if (kind === "curve") score.水 += 2;
    if (kind === "left-fall") score.火 += 2;
    if (kind === "horizontal") score.土 += 1;
    if (kind === "dot") score.水 += 1;
  });
  if (crossing) score.土 += 2;
  const sorted = (Object.entries(score) as Array<[Element, number]>).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] < 3 || sorted[0][1] === sorted[1][1]) return null;
  const basis: Record<Element, string> = {
    金: "一挑一捺俱为金", 木: "有直不斜方是木", 水: "走之平稳水溶溶／三直相连化水名",
    火: "撇长撇短皆为火", 土: "横直交加土最深",
  };
  return { element: sorted[0][0], score: sorted[0][1], basis: basis[sorted[0][0]] };
}

function julianDayNumber(year: number, month: number, day: number) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function getGanzhiDay(date: Date) {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const index = (julianDayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate()) + 49) % 60;
  return `${stems[index % 10]}${branches[index % 12]}`;
}

export function getHourBranch(date: Date) {
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  return branches[Math.floor(((date.getHours() + 1) % 24) / 2)];
}

export function runRuleEngine(input: { character: string; strokes: Stroke[]; time: Date; origin: string }): RuleResult {
  const kinds = input.strokes.map(describeStroke);
  const crossing = hasCrossing(input.strokes);
  const trigrams = detectTrigrams(input.character, input.strokes, kinds);
  const element = detectElement(kinds, crossing);
  const rounds: RuleRound[] = [];
  const detected: string[] = [];

  if (input.character === "失") {
    rounds.push({
      eyebrow: "第一轮 · 失物专条", title: "先扩大范围，并接受它较难寻找",
      body: `你提交的字本身就是“失”。《新订指明心法》在失物专条中直接判为难觅。先以“${input.origin}”为中心扩大检查范围，不把它限定在一个小角落。`,
      tags: ["难觅", "扩大范围"], basis: "凡字有失字体及字中，皆难觅。",
    });
    detected.push("失字直断");
  }

  const best = trigrams[0];
  if (best) {
    const info = trigramInfo[best.trigram];
    const sameScore = trigrams.filter((item) => item.score === best.score && item.trigram !== best.trigram)[0];
    const direction = sameScore ? `${info.direction}或${trigramInfo[sameScore.trigram].direction}` : info.direction;
    rounds.push({
      eyebrow: rounds.length ? "第二轮 · 八卦字形" : "第一轮 · 八卦字形",
      title: `先往${direction}侧寻找`,
      body: `以“${input.origin}”为原点，优先检查${direction}侧的${info.place}。字形触发${best.trigram}象，原书将其性情定为“${info.nature}”。`,
      tags: [direction, `${best.trigram}象`, info.nature], basis: best.basis,
    });
    detected.push(`${best.trigram}象`);
  }

  if (element && rounds.length < 3) {
    rounds.push({
      eyebrow: `${rounds.length + 1 === 1 ? "第一" : rounds.length + 1 === 2 ? "第二" : "第三"}轮 · 五行笔形`,
      title: `留意${element.element}性物体附近`,
      body: `当前笔迹中${element.element}笔占优。把${elementPlaces[element.element]}列为下一检查项；这是笔形取类，不等于确定材质。`,
      tags: [`${element.element}笔`, "附近属性"], basis: element.basis,
    });
    detected.push(`${element.element}笔占优`);
  }

  const movementChars = "这过还进远近道送追退逃运迟速边连迷返迎选通逛走";
  if (movementChars.includes(input.character) && rounds.length < 3) {
    rounds.push({
      eyebrow: `${rounds.length + 1 === 1 ? "第一" : rounds.length + 1 === 2 ? "第二" : "第三"}轮 · 移动线索`,
      title: "物品存在被移动的可能",
      body: "这个字带有明确的行走形态。系统只提示它可能不在原来的落点，不指认任何人，也不能作为偷窃证据。",
      tags: ["可能移动", "不指认他人"], basis: "马星以走形为据；这里只保留移动可能性，不扩展人物判断。",
    });
    detected.push("走形");
  }

  if (rounds.length === 0) {
    rounds.push({
      eyebrow: "可靠线索不足", title: "这个字没有触发可执行的失物专条",
      body: "当前固定规则没有识别出足以给出方位或附近属性的笔形。系统在这里停止，不使用生活常识或随机方位补答案。",
      tags: ["不补答案"], basis: "古籍没有形成可机器执行的对应条目。",
    });
  }

  return {
    rounds: rounds.slice(0, 3), ganzhiDay: getGanzhiDay(input.time), hourBranch: getHourBranch(input.time),
    detected, engineVersion: "xunwu-0.2.0",
  };
}
