// 西游取经：40 关固定配置，耗时单位小时，累计目标逐关相加（共 437 小时）。
export interface JourneyLevel {
  id: number;
  name: string;
  hours: number;
  summary: string;
  image: string;
}

const raw: [string, number, string][] = [
  ['五行山收悟空', 8, '唐僧揭去五行山封条，收下压了五百年的孙悟空。'],
  ['观音院失袈裟', 15, '观音院老僧贪图袈裟，黑风山妖风卷走宝贝。'],
  ['黑风山斗熊罴怪', 10, '悟空化作仙丹，钻进黑熊精腹中逼它还袈裟。'],
  ['高老庄收八戒', 6, '高老庄招亲的猪妖，原是贬下凡的天蓬元帅。'],
  ['浮屠山遇乌巢禅师', 13, '乌巢禅师授《心经》，一路持诵，心魔渐息。'],
  ['黄风岭', 9, '黄风怪一口三昧神风，吹得行者睁不开眼。'],
  ['流沙河收沙僧', 16, '流沙河八百里弱水，卷帘大将皈依，师徒四人聚齐。'],
  ['四圣试禅心', 7, '黎山老母与三菩萨化作母女，试师徒禅心。'],
  ['五庄观人参果', 12, '偷吃人参果、推倒果树，观音净瓶救活仙根。'],
  ['三打白骨精', 14, '白骨精三变人形，悟空三打，唐僧一纸贬书。'],
  ['宝象国黄袍怪', 8, '黄袍怪摄走百花羞，八戒沙僧败阵，行者回身降妖。'],
  ['平顶山莲花洞', 11, '金角银角五件宝贝，悟空装天、换葫芦、骗绳索。'],
  ['乌鸡国', 6, '国王魂魄托梦，井底捞尸，一粒还魂丹救回真君。'],
  ['火云洞红孩儿', 15, '圣婴大王三昧真火，观音天罡刀化作莲台收服。'],
  ['黑水河', 9, '鼍龙占河，西海龙王太子摩昂擒妖还河。'],
  ['车迟国斗法', 13, '求雨、坐禅、隔板猜物、砍头剖腹，三仙尽败。'],
  ['通天河', 7, '灵感大王索童男童女，观音鱼篮收金鱼。'],
  ['金兜山青牛精', 16, '独角兕大王金刚镯收尽兵器，老君芭蕉扇收回。'],
  ['女儿国', 10, '西梁女国子母河，落胎泉解胎，女王愿以国相托。'],
  ['琵琶洞蝎子精', 12, '蝎子精倒马毒桩，昴日星官一唱降妖。'],
  ['真假美猴王', 6, '六耳猕猴假冒行者，谛听不敢言，如来识破。'],
  ['火焰山借芭蕉扇', 14, '三调芭蕉扇，一扇熄火，二扇生风，三扇下雨。'],
  ['祭赛国金光寺', 8, '佛宝舍利被盗，碧波潭九头虫夺宝，悟空夺回。'],
  ['小雷音寺黄眉怪', 11, '假佛祖黄眉童子金铙扣人，弥勒收归座下。'],
  ['朱紫国', 15, '国王病相思，悟空行医，揭榜医龙马，救回金圣宫。'],
  ['盘丝洞七蜘蛛精', 7, '七仙姑濯垢泉，悟空变鹰叼衣，掀翻盘丝洞。'],
  ['黄花观百眼魔君', 13, '百眼金光罩人，毗蓝婆菩萨绣针破金光。'],
  ['狮驼岭三魔王', 9, '青狮白象大鹏三妖据岭，如来亲至收鹏。'],
  ['比丘国救儿童', 16, '国丈要小儿心肝，寿星收白鹿，狐狸精现形。'],
  ['无底洞老鼠精', 10, '金鼻白毛老鼠精摄僧，李靖哪吒押回天庭。'],
  ['灭法国', 6, '国王杀僧，悟空夜剃满朝头发，国王悔悟改国号。'],
  ['凤仙郡求雨', 12, '郡侯推倒斋供，米山面山金锁，悟空劝善回天。'],
  ['玉华州收徒传艺', 14, '三王子拜师，兵器被黄狮精盗，太乙救苦收九灵。'],
  ['金平府犀牛精', 8, '三犀牛假佛偷油，四木禽星角木蛟等擒妖。'],
  ['天竺国玉兔精', 15, '玉兔假公主抛绣球，太阴星君收归月宫。'],
  ['铜台府地灵县', 7, '寇员外斋僧遇害，悟空走地府，还魂昭雪。'],
  ['凌云渡脱胎换骨', 11, '无底船渡凌云，唐僧脱去凡胎，见佛真身。'],
  ['灵山取得真经', 13, '大雷音寺拜佛，阿傩伽叶索人事，无字真经换有字。'],
  ['通天河老鼋问寿', 9, '老鼋驮经回东土，问寿未答，经书落水晒经石。'],
  ['返回东土、功德圆满', 16, '真经送抵长安，师徒受封，八部天龙各归本位。'],
];

export const JOURNEY_HOURS = raw.reduce((sum, [, hours]) => sum + hours, 0); // 437

export const JOURNEY_LEVELS: JourneyLevel[] = raw.map(([name, hours, summary], index) => ({
  id: index + 1,
  name,
  hours,
  summary,
  image: `/journey/${String(index + 1).padStart(2, '0')}.jpg`,
}));

// 每关的累计目标（秒）。
export const JOURNEY_TARGETS: number[] = (() => {
  let total = 0;
  return raw.map(([, hours]) => (total += hours * 3600));
})();

export interface JourneyState {
  seconds: number;
  cleared: number;
  current: JourneyLevel | null;
  currentTarget: number;
  currentDone: number;
  nextAt: number;
  completed: boolean;
}

export function journeyState(seconds: number): JourneyState {
  const value = Math.max(0, Math.floor(seconds));
  let cleared = 0;
  while (cleared < JOURNEY_TARGETS.length && value >= JOURNEY_TARGETS[cleared]) cleared += 1;
  const completed = cleared >= JOURNEY_LEVELS.length;
  const current = completed ? null : JOURNEY_LEVELS[cleared];
  const base = cleared > 0 ? JOURNEY_TARGETS[cleared - 1] : 0;
  const target = completed ? JOURNEY_TARGETS[JOURNEY_TARGETS.length - 1] : JOURNEY_TARGETS[cleared];
  return {
    seconds: value,
    cleared,
    current,
    currentTarget: target - base,
    currentDone: Math.max(0, Math.min(value - base, target - base)),
    nextAt: target,
    completed,
  };
}

// 次数按每次 2 秒折算，时长模式按秒；两者统一成秒。
export function practiceSeconds(targetKind: string, total: number): number {
  return targetKind === 'time' ? Math.max(0, total) : Math.max(0, total) * 2;
}

export function hm(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
  return `${minutes} 分`;
}
