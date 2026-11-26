// Classic worker entry. All compressed data comes from the embedded runtime.
(() => {
  "use strict";

  const tables = self.kokoroPackedReadings;
  const kana = self.kokoroKana;
  let japanese;
  let english;

  async function unpack(encoded) {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream);
  }

  const englishLetters = [
    "ˈA", "bˈi", "sˈi", "dˈi", "ˈi", "ˈɛf", "ʤˈi", "ˈAʧ", "ˈI",
    "ʤˈA", "kˈA", "ˈɛl", "ˈɛm", "ˈɛn", "ˈO", "pˈi", "kjˈu", "ˈɑɹ",
    "ˈɛs", "tˈi", "jˈu", "vˈi", "dˈʌbəljˌu", "ˈɛks", "wˈI", "zˈi"
  ];
  function spellEnglish({text}) {
    return [...text.toUpperCase()].filter(char => /^[A-Z]$/.test(char))
      .map(char => englishLetters[char.charCodeAt(0) - 65]).join(" ");
  }

  async function createEnglish() {
    const data = await (await unpack(tables.english)).json();
    return self.makeOfflineMisaki(data, {fallback: spellEnglish});
  }

  async function createJapanese() {
    const [wordData, matrixData] = await Promise.all([
      unpack(tables.japanese).then(response => response.text()),
      unpack(tables.connections).then(response => response.arrayBuffer())
    ]);
    const words = new Map();
    let maxLength = 0;
    for (const line of wordData.split("\n")) {
      const end = line.indexOf("\t");
      const word = line.slice(0, end);
      maxLength = Math.max(end, maxLength);
      words.set(word, line.slice(end + 1));
    }
    return {words, maxLength, costs: new Int16Array(matrixData)};
  }

  const hiragana = text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));

  // Misaki's Kokoro v1.0 Cutlet representation, including the moraic nasal
  // allophones and the one-symbol glottal stop used for sokuon.
  function kanaPhones(text) {
    const chars = [...hiragana(text)];
    let phones = "";
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const next = chars[i + 1] || "";
      if (c === "ん") {
        const consonant = (kana[next] || "")[0] || "";
        if (["m", "p", "b"].includes(consonant)) phones += "m";
        else if (["k", "ɡ"].includes(consonant)) phones += "ŋ";
        else if (["ɲ", "ʨ", "ʥ"].includes(consonant)) phones += "ɲ";
        else if (["n", "t", "d", "ɾ", "z"].includes(consonant)) phones += "n";
        else phones += "ɴ";
      } else if (c === "っ") {
        phones += "ʔ";
      } else if (c === "ー") {
        phones += "ː";
      } else if (next && kana[c + next]) {
        phones += kana[c + next];
        i++;
      } else {
        phones += kana[c] || "";
      }
    }
    return phones;
  }

  const japaneseDigits = ["ゼロ", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュー"];
  const largeUnits = ["", "マン", "オク", "チョー", "ケイ", "ガイ"];
  const thousands = ["", "セン", "ニセン", "サンゼン", "ヨンセン", "ゴセン", "ロクセン", "ナナセン", "ハッセン", "キューセン"];
  const hundreds = ["", "ヒャク", "ニヒャク", "サンビャク", "ヨンヒャク", "ゴヒャク", "ロッピャク", "ナナヒャク", "ハッピャク", "キューヒャク"];

  function groupReading(group) {
    const [th, h, t, u] = [...group.padStart(4, "0")].map(Number);
    return thousands[th] + hundreds[h] + (t ? (t === 1 ? "" : japaneseDigits[t]) + "ジュー" : "") + (u ? japaneseDigits[u] : "");
  }

  function integerReading(digits) {
    if (digits === "0") return japaneseDigits[0];
    if (digits.startsWith("0") || digits.length > largeUnits.length * 4) {
      return [...digits].map(digit => japaneseDigits[Number(digit)]).join("");
    }
    let result = "";
    for (let end = digits.length, i = 0; end > 0; end -= 4, i++) {
      const reading = groupReading(digits.slice(Math.max(0, end - 4), end));
      if (reading) result = reading + largeUnits[i] + result;
    }
    return result;
  }

  const counters = {
    年: "ネン", 月: "ガツ", 日: "ニチ", 人: "ニン", 枚: "マイ", 本: "ホン",
    匹: "ヒキ", 個: "コ", 回: "カイ", 階: "カイ", 冊: "サツ", 分: "フン",
    秒: "ビョー", 時: "ジ", 歳: "サイ", 円: "エン", 台: "ダイ", 件: "ケン", つ: "ツ"
  };
  const nativeCount = ["", "ヒトツ", "フタツ", "ミッツ", "ヨッツ", "イツツ", "ムッツ", "ナナツ", "ヤッツ", "ココノツ", "トオ"];
  const dates = {1:"ツイタチ", 2:"フツカ", 3:"ミッカ", 4:"ヨッカ", 5:"イツカ", 6:"ムイカ", 7:"ナノカ", 8:"ヨーカ", 9:"ココノカ", 10:"トーカ", 14:"ジューヨッカ", 20:"ハツカ", 24:"ニジューヨッカ"};
  function numberReading(value, counter = "") {
    const [whole, fraction] = value.replaceAll(",", "").split(".");
    let reading = integerReading(whole);
    if (fraction) {
      return reading + "テン" + [...fraction].map(n => japaneseDigits[Number(n)]).join("") + (counters[counter] || "");
    }
    if (!counter) return reading;
    if (counter === "つ" && nativeCount[whole]) return nativeCount[whole];
    if (counter === "日" && dates[whole]) return dates[whole];
    if (counter === "人" && whole === "1") return "ヒトリ";
    if (counter === "人" && whole === "2") return "フタリ";
    if (counter === "歳" && whole === "20") return "ハタチ";
    if (counter === "月" || counter === "時" || counter === "日") {
      reading = reading.replace(/ナナ$/, "シチ").replace(/キュー$/, "ク");
    }
    if (counter === "月") reading = reading.replace(/ヨン$/, "シ");
    if (["時", "人", "年"].includes(counter)) reading = reading.replace(/ヨン$/, "ヨ");
    let suffix = counters[counter];
    if (["本", "匹", "分"].includes(counter)) {
      const [unvoiced, voiced, plosive] = {本:["ホン","ボン","ポン"], 匹:["ヒキ","ビキ","ピキ"], 分:["フン","プン","プン"]}[counter];
      suffix = unvoiced;
      if (/サン$/.test(reading)) suffix = voiced;
      if (counter === "分" && /ヨン$/.test(reading)) suffix = plosive;
      if (/(イチ|ロク|ハチ|ジュー|ヒャク)$/.test(reading)) {
        reading = reading.replace(/(イチ|ロク|ハチ|ジュー|ヒャク)$/, word => ({イチ:"イッ",ロク:"ロッ",ハチ:"ハッ",ジュー:"ジュッ",ヒャク:"ヒャッ"})[word]);
        suffix = plosive;
      }
    } else if (["回", "階", "個", "件", "冊", "歳"].includes(counter)) {
      reading = reading.replace(/イチ$/, "イッ").replace(/ハチ$/, "ハッ").replace(/ジュー$/, "ジュッ");
      if (["回", "階", "個", "件"].includes(counter)) reading = reading.replace(/ロク$/, "ロッ");
      if (counter === "階" && /サン$/.test(reading)) suffix = "ガイ";
    }
    return reading + suffix;
  }

  // Written numerals may be part of names (四日市) and compounds (一人称).
  // Normalize an explicit count at a boundary, including successive dates.
  function normalizeKanjiCounts(text) {
    const digits = "〇一二三四五六七八九";
    const powers = {十:10n, 百:100n, 千:1000n, 万:10000n, 億:100000000n, 兆:1000000000000n, 京:10000000000000000n};
    return text.replace(/([〇零一二三四五六七八九十百千万億兆京]+)([年月日人枚本匹個回階冊分秒時歳円台件つ])(?=$|[^\p{Script=Han}]|[〇零一二三四五六七八九十百千]|間)/gu, (original, numeral, unit, offset) => {
      let pending = "";
      let group = 0n;
      let total = 0n;
      for (const c of numeral) {
        const power = powers[c];
        if (!power) pending += c === "零" ? "0" : digits.indexOf(c);
        else if (power < 10000n) {
          group += BigInt(pending || "1") * power;
          pending = "";
        } else {
          total += (group + BigInt(pending || "0") || 1n) * power;
          group = 0n;
          pending = "";
        }
      }
      const number = String(total + group + BigInt(pending || "0"));
      if (number === "1" && unit === "日" && text[offset - 1] !== "月") return "イチニチ";
      return number + unit;
    });
  }

  const letters = "エー ビー シー ディー イー エフ ジー エイチ アイ ジェー ケー エル エム エヌ オー ピー キュー アール エス ティー ユー ブイ ダブリュー エックス ワイ ゼット".split(" ");

  // At each boundary keep the best path per previous context ID. Two paths
  // ending in the same context have identical costs for every continuation.
  function japaneseWords(text, {words, maxLength, costs}) {
    const ends = Array.from({length: text.length + 1}, () => new Map());
    ends[0].set(0, {score: 0, context: 0});
    const columns = costs[1];
    for (let at = 0; at < text.length; at++) {
      if (!ends[at].size) continue;
      const add = (end, context, cost, reading) => {
        for (const prev of ends[at].values()) {
          const score = prev.score + costs[2 + prev.context * columns + context] + cost;
          if (score < (ends[end].get(context)?.score ?? Infinity)) {
            ends[end].set(context, {score, context, prev, reading});
          }
        }
      };
      let found = false;
      for (let end = at + 1; end <= Math.min(text.length, at + maxLength); end++) {
        const choices = words.get(text.slice(at, end));
        if (!choices) continue;
        found = true;
        for (const choice of choices.split("\t")) {
          const [context, cost, reading] = choice.split(" ");
          add(end, Number(context), Number(cost), reading);
        }
      }
      // Preserve unknown loanwords and kana spellings as complete mora runs.
      if (/[ァ-ヶー]/.test(text[at])) {
        let end = at + 1;
        while (end < text.length && end - at < 80 && /[ァ-ヶー]/.test(text[end])) end++;
        add(end, 1285, 14000, text.slice(at, end));
      } else if (!found) {
        const char = String.fromCodePoint(text.codePointAt(at));
        add(at + char.length, 1285, 20000, char);
      }
    }
    let best;
    let finalCost = Infinity;
    for (const node of ends[text.length].values()) {
      const score = node.score + costs[2 + node.context * columns];
      if (score < finalCost) { best = node; finalCost = score; }
    }
    const readings = [];
    for (let node = best; node?.prev; node = node.prev) {
      if (/\p{Script=Han}/u.test(node.reading)) {
        throw Object.assign(new Error("No Japanese reading for " + node.reading), {code: "reading"});
      }
      readings.push(kanaPhones(node.reading));
    }
    return readings.reverse().filter(Boolean).join(" ");
  }

  const punctuation = {"。":".","、":",","「":"“","」":"”","『":"“","』":"”","【":"(","】":")","《":"(","》":")","・":" ","~":"—","〜":"—","-":"—","[":"(","]":")"};
  function japanesePhones(text, dictionary) {
    const tokens = [];
    const normalized = normalizeKanjiCounts(text.normalize("NFKC")).replace(/(?<=\d)[~〜](?=\d)/g, "から").replaceAll("%", "パーセント").replaceAll("&", "アンド").replaceAll("+", "プラス");
    // Split at changes of writing system so dates, punctuation and initialisms
    // keep their own readings without interrupting Japanese particles.
    for (const match of normalized.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)([年月日人枚本匹個回階冊分秒時歳円台件つ]?)|[A-Za-z]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+|[^\s]/gu)) {
      const word = match[0];
      if (match[1]) tokens.push(kanaPhones(numberReading(match[1], match[2])));
      else if (/^[A-Za-z]/.test(word)) tokens.push(kanaPhones([...word.toUpperCase()].map(c => letters[c.charCodeAt(0) - 65]).join("")));
      else if (Object.hasOwn(punctuation, word)) tokens.push(punctuation[word]);
      else if (/^[;:,.!?"()“”…—]$/.test(word)) tokens.push(word);
      else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(word)) tokens.push(japaneseWords(word, dictionary));
    }
    return tokens.join(" ").replace(/\s+([;:,.!?”)])/g, "$1").replace(/([(“])\s+/g, "$1").replace(/\s+/g, " ").trim();
  }

  self.kokoroPhonemize = async (text, language) => {
    if (!text.trim()) return "";
    if (language === "ja") {
      japanese ??= createJapanese();
      return japanesePhones(text, await japanese);
    }
    if (language === "en") {
      english ??= createEnglish();
      return (await english).phonemize(text.normalize("NFKC")).phonemes.replace(/\s+/g, " ").trim();
    }
    throw new Error("Unknown pronunciation language " + language);
  };
})();
