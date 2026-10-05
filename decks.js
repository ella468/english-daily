function wordDeck(prefix, title, list) {
  return {
    title,
    items: list.map(([w, ipa, cn, ex, exCn]) => ({ id: prefix + ":" + w, kind: "word", front: w, ipa, cn, ex, exCn })),
  };
}

const SCENE_WORDS = [WORDS, TRAVEL, ADS, BUSINESS, FINANCE, DINING, HOME, SOCIAL, HEALTH];
const KNOWN = new Set(SCENE_WORDS.flat().map((r) => r[0].toLowerCase()));
const cet4 = CET4.filter((r) => !KNOWN.has(r[0].toLowerCase()));
cet4.forEach((r) => KNOWN.add(r[0].toLowerCase()));
const cet6 = CET6.filter((r) => !KNOWN.has(r[0].toLowerCase()));

function lessonItems(L, i) {
  const n = "l" + (i + 1) + ":";
  const sentences = L.lines.map(([, en, cn], j) => ({ id: n + "s" + j, kind: "sentence", front: en, cn }));
  const words = L.words.map(([w, ipa, cn]) => {
    const lw = w.toLowerCase();
    const line = L.lines.find((l) => l[1].toLowerCase().includes(lw)) ||
      L.lines.find((l) => l[1].toLowerCase().includes(lw.split(" ")[0]));
    return { id: n + "w:" + w, kind: "word", front: w, ipa, cn, ex: line && line[1], exCn: line && line[2] };
  });
  return [...sentences, ...words];
}

const DECKS = {
  words: wordDeck("w", "基础单词", WORDS),
  phrases: {
    title: "口语句子",
    items: PHRASES.map(([en, cn]) => ({ id: "p:" + en, kind: "sentence", front: en, cn })),
  },
  lessons: { title: "原创课文", noFresh: true, items: LESSONS.flatMap(lessonItems) },
  travel: wordDeck("t", "旅游出行", TRAVEL),
  ads: wordDeck("a", "广告营销", ADS),
  business: wordDeck("b", "商务职场", BUSINESS),
  finance: wordDeck("f", "财务会计", FINANCE),
  dining: wordDeck("d", "餐饮购物", DINING),
  home: wordDeck("o", "住房生活", HOME),
  social: wordDeck("s", "社交聊天", SOCIAL),
  health: wordDeck("h", "健康医疗", HEALTH),
  roots: {
    title: "词根词缀",
    items: ROOTS.map(([root, cn, parts]) => ({
      id: "r:" + root, kind: "root", front: root, cn, parts, say: parts.map((p) => p[0]).join(", "),
    })),
  },
  cet4: wordDeck("c4", "四级词汇", cet4),
  cet6: wordDeck("c6", "六级词汇", cet6),
};
