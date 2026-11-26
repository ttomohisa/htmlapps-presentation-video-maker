"""Recreate the checked-in worker resources. Only this maintenance script uses the network."""
import argparse
import ast
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import tarfile
import tempfile
import urllib.request

OUT = Path(__file__).resolve().parents[1] / "vendor" / "local-tts-phonemes"
MISAKI = "https://raw.githubusercontent.com/hexgrad/misaki/fba1236595f2d2bf21d414ba6e57d25256afada3/"
PACKAGES = {
    "kuromoji@0.1.2": "ccf8778839df92ae3a3d64a93998ac92d1e92c7f73fe6193295a5258c98308b4",
    "@titan-design/speech-g2p@0.2.0": "6d318bd9914fbd6aa7c35bb73978c4cad99ed528541b506f85da5abf01b2f02e",
    "compromise@14.18.0": "fdc069b55fc5b5c3664bfa6dfd365b895b3eadbca8855e979a16812d6c0125de",
    "efrt@2.9.0": "f67775d99a6046ab4312f6359e678903062e0fd25b03a7678c813bc7a319f308",
    "grad-school@0.0.9": "02bec0a902a6d3ff82fdd1e08f5c6507cf2460ccfb94d0749d295f18ca509d6e",
    "suffix-thumb@6.0.0": "3d8d1052617d0f1b833ace774792916423df1ef02fa32743abf6abf129a990c6",
}


def fetch(name, url, digest, cache):
    path = cache / name
    data = path.read_bytes() if path.is_file() else urllib.request.urlopen(url, timeout=90).read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"Unexpected SHA-256 for {name}")
    if not path.is_file():
        path.write_bytes(data)
    return data


def package_files(cache):
    packages = {}
    for spec, digest in PACKAGES.items():
        name, version = spec.rsplit("@", 1)
        tarball = f"{name.split('/')[-1]}-{version}.tgz"
        filename = name.strip("@").replace("/", "-") + f"-{version}.tgz"
        data = fetch(filename, f"https://registry.npmjs.org/{name}/-/{tarball}", digest, cache)
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            packages[name] = {m.name.removeprefix("package/"): archive.extractfile(m).read()
                              for m in archive.getmembers() if m.isfile()}
    return packages


def packed(data):
    # Normalize the gzip OS byte across Python platforms and releases.
    zipped = bytearray(gzip.compress(data, compresslevel=9, mtime=0))
    zipped[9] = 255
    return base64.b64encode(zipped).decode("ascii")


def japanese_dictionary(package):
    # IPADIC gives a word multiple context IDs, costs and pronunciations. Keep
    # those alternatives so contextual particle and verb readings survive.
    features = gzip.decompress(package["dict/tid_pos.dat.gz"]).rstrip(b"\0").split(b"\0")
    records = gzip.decompress(package["dict/tid.dat.gz"])
    words = {}
    for index, raw in enumerate(features):
        surface, *fields = raw.decode().split(",")
        reading = fields[-1]
        if not surface or not reading or reading == "*" or re.search(r"[\s,]", surface):
            continue
        left, right, cost, _ = struct.unpack_from("<hhhI", records, index * 10)
        assert left == right, "IPADIC has distinct left and right context IDs"
        key = (left, reading)
        alternatives = words.setdefault(surface, {})
        alternatives[key] = min(cost, alternatives.get(key, cost))
    result = []
    for surface, entries in sorted(words.items()):
        choices = [f"{context} {cost} {reading}" for (context, reading), cost in entries.items()]
        result.append("\t".join([surface, *choices]))
    return packed("\n".join(result).encode())


def kana_table(source):
    # Only parse the pinned table's chr(integer) expressions and literals.
    def string(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            return string(node.left) + string(node.right)
        assert isinstance(node, ast.Call) and node.func.id == "chr"
        return chr(node.args[0].value)

    table = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and ast.unparse(node.targets[0]) == "HEPBURN":
            entries = node.value
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and ast.unparse(node.value.func) == "HEPBURN.update":
            entries = node.value.args[0]
        else:
            continue
        table.update({string(k): string(v) for k, v in zip(entries.keys, entries.values)})
    assert len(table) >= 164
    return json.dumps(table, ensure_ascii=False, separators=(",", ":"))


def english_factory(data):
    # The pinned distribution already bundles the TypeScript sources. Replace
    # its Node-only bootstrap; preserve its actual tokenizer, tagger and G2P.
    s = data["dist/index.js"].decode()
    s = re.sub(r"^import .*?;\s*$", "", s, flags=re.M)
    s = re.sub(r"^var \w+_URL = .*?;\s*$", "", s, flags=re.M)
    s = s[:s.index("function ttsTokens")]
    s = s[:s.index("function isEntry")] + s[s.index("// src/spacy-tokenizer.ts"):]
    s = s[:s.index("function isPatternSpec")] + s[s.index("var Explainer"):]
    s = s[:s.index("var cachedVersion")] + s[s.index("function misakiEnglish"):]
    s = s.replace("spacyTokenizer()", "spacyTokenizer(data.tokenizer)")
    s = s.replace("function spacyTokenizer(data = loadSpacyTokenizerData())", "function spacyTokenizer(data)")
    s = s.replace("baseLexicon ??= loadLexiconData()", "{golds:growDictionary(data.golds),silvers:growDictionary(data.silvers)}")
    s = s.replace("g2pVersion(options.words ?? {})", '"speech-g2p@0.2.0"')
    assert not re.search(r"readFileSync|createHash|import\.meta|new Function|\beval\(", s)
    return "self.makeOfflineMisaki = function (data, options) {\nconst nlp = self.nlp;\n" + s + "\nreturn misakiEnglish(options);\n};\n"


def english_spelling_rules(cache):
    archive = fetch("ephone-1.0.2.tgz", "https://registry.npmjs.org/ephone/-/ephone-1.0.2.tgz",
                    "20f654d6b92b9ef2e96244c19640d9def4457bbdd7e3132fcc1129921e727cbb", cache)
    with tarfile.open(fileobj=io.BytesIO(archive)) as package:
        engine = package.extractfile("package/ephone.js").read().decode()
        language = package.extractfile("package/lang/en-us.js").read().decode()
        license_text = package.extractfile("package/COPYING").read()
    engine, separator, _ = engine.partition("export default createEphone;")
    assert separator and language.count("export function loadData(") == 1
    # Link only the default English data into the engine. The package ships
    # both its Wasm and language bytes inside JavaScript string literals.
    language = language.replace("export function loadData(", "function en_us(")
    bundle = language + "\n" + engine + separator + "\n"
    (OUT / "espeak-en-us.mjs").write_text(bundle, encoding="utf-8", newline="\n")
    (OUT / "ephone-COPYING").write_bytes(license_text)


def main(cache):
    OUT.mkdir(parents=True, exist_ok=True)
    english_spelling_rules(cache)
    packages = package_files(cache)
    cutlet = fetch("cutlet.py", MISAKI + "misaki/cutlet.py",
                   "7695fc7d853ae4e99679dff4ca0c8404d4804a6fb1059a9d6ad02baeabc4d4de", cache)
    apache = fetch("misaki-license.txt", MISAKI + "LICENSE",
                   "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4", cache)
    cutlet_license = fetch("cutlet-license.txt", "https://raw.githubusercontent.com/polm/cutlet/master/LICENSE",
                          "8736ad0d4636cb6dabae3e97e99c08f5c0c08b8c451f1d489b29a0d63bebf074", cache)
    titan = packages["@titan-design/speech-g2p"]
    notices = ["Pronunciation resources", """
Japanese word candidates and connection costs were repacked from MeCab IPADIC
2.7.0-20070801 in kuromoji 0.1.2. The kana-to-Kokoro table and its nasal
rules derive from hexgrad/misaki at fba1236595f2d2bf21d414ba6e57d25256afada3,
which adapts Paul O'Leary McCann's Cutlet.

English processing uses @titan-design/speech-g2p 0.2.0 with its filesystem
bootstrap replaced for the browser. It includes Misaki 0.9.4 pronunciation
lexicons and spaCy tokenizer rules. Compromise 14.18.0 provides part-of-speech
tagging; its browser distribution includes efrt, grad-school and suffix-thumb.
Resource preparation and pinned source hashes: scripts/prepare-local-tts-phonemes.py.
""", packages["kuromoji"]["NOTICE.md"].decode(), cutlet_license.decode(), titan["NOTICE"].decode(), apache.decode()]
    for name in packages:
        if not name.startswith("kuromoji"):
            notices.extend([name, packages[name]["LICENSE"].decode()])
    notice = "\n\n".join(notices)
    (OUT / "NOTICES.txt").write_text(notice, encoding="utf-8", newline="\n")
    english_data = {key: json.loads(titan[f"data/{path}.json"])
                    for key, path in [("golds", "us_gold"), ("silvers", "us_silver"), ("tokenizer", "spacy-en-tokenizer")]}
    compact_english = json.dumps(english_data, ensure_ascii=False, separators=(",", ":")).encode()
    kuromoji = packages["kuromoji"]
    assets = {"english": packed(compact_english), "japanese": japanese_dictionary(kuromoji),
              "connections": packed(gzip.decompress(kuromoji["dict/cc.dat.gz"]))}
    target = OUT / "runtime.js"
    with target.open("w", encoding="utf-8", newline="\n") as out:
        out.write("/* Generated by scripts/prepare-local-tts-phonemes.py.\n" + notice.replace("*/", "* /") + "\n*/\n")
        out.write(packages["compromise"]["builds/compromise.js"].decode() + "\n;")
        out.write(english_factory(titan))
        out.write("self.kokoroKana = " + kana_table(cutlet) + ";\n")
        out.write("self.kokoroPackedReadings = " + json.dumps(assets, separators=(",", ":")) + ";\n")
    print(f"{target.name}: {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cache", type=Path, help="directory for verified upstream archives")
    args = p.parse_args()
    if args.cache:
        args.cache.mkdir(parents=True, exist_ok=True)
        main(args.cache)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            main(Path(tmp))
