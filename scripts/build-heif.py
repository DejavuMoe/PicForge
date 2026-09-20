#!/usr/bin/env python3
"""Build PicForge's HEVC-only libheif WASM with an activated Emscripten 3.1.61.

Requires Python >= 3.10 with tarfile.data_filter, CMake >= 3.16, Ninja (or make),
and Node.js on PATH (the activated Emscripten SDK supplies Node.js).
Sources/builds stay in --work-dir (a temporary directory by default). Only the
module, WASM, license and provenance manifest are copied to --output.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request


EMSCRIPTEN = "3.1.61"
SOURCES = {
    "libheif": {
        "version": "1.23.4",
        "url": "https://github.com/strukturag/libheif/releases/download/v1.23.4/libheif-1.23.4.tar.gz",
        "sha256": "d0c02b4b0e978f34a1974b6f3eea7975a537bf7a9195ffeea38e7242ff316fdd",
    },
    "libde265": {
        "version": "1.1.1",
        "url": "https://github.com/strukturag/libde265/releases/download/v1.1.1/libde265-1.1.1.tar.gz",
        "sha256": "fd48a927e94ed74fc7ce8829d222b9d8599fcbfe8b6448ba66705babc56ab219",
    },
}
HEIF_DISABLED = (
    "X265 KVAZAAR UVG266 VVDEC VVENC X264 OpenH264_DECODER DAV1D AOM_DECODER "
    "AOM_ENCODER SvtEnc RAV1E JPEG_DECODER JPEG_ENCODER OpenJPEG_ENCODER "
    "OpenJPEG_DECODER FFMPEG_DECODER OPENJPH_ENCODER UNCOMPRESSED_CODEC "
    "WEBCODECS LIBSHARPYUV LIBSHARPYUV_INTERNAL EXAMPLES GDK_PIXBUF "
    "HEADER_COMPRESSION"
).split()
LINK_FLAGS = [
    "-O3", "-lembind", "--no-entry", "-sMODULARIZE=1", "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=libheif", "-sDYNAMIC_EXECUTION=0", "-sALLOW_MEMORY_GROWTH=1",
    "-sFILESYSTEM=0", "-sENVIRONMENT=web,worker,node",
    '-sEXPORTED_FUNCTIONS=["_de265_get_version_number"]',
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args, **kwargs):
    print("+", " ".join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--emsdk", default=os.environ.get("EMSDK"))
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1]
                        / "packages/app/public/wasm/heif-1.23.4-de265-1.1.1")
    args = parser.parse_args()
    if sys.version_info < (3, 10) or not hasattr(tarfile, "data_filter"):
        parser.error("Python >= 3.10 with the security-backported tarfile.data_filter is required")
    if not args.emsdk:
        parser.error("activate Emscripten 3.1.61 or pass --emsdk PATH")
    sdk = Path(args.emsdk).resolve()
    emcc = sdk / "upstream/emscripten/emcc.py"
    version = run(sys.executable, emcc, "--version", capture_output=True, text=True).stdout
    if not re.search(r"\b3\.1\.61\b", version):
        raise RuntimeError(f"Expected Emscripten {EMSCRIPTEN}; found {version.strip()}")
    work = (args.work_dir or Path(tempfile.mkdtemp(prefix="picforge-heif-"))).resolve()
    work.mkdir(parents=True, exist_ok=True)
    print(f"Build directory: {work}", flush=True)
    for name, source in SOURCES.items():
        archive = work / f"{name}.tar.gz"
        if not archive.exists():
            urllib.request.urlretrieve(source["url"], archive)
        if sha256(archive) != source["sha256"]:
            raise RuntimeError(f"SHA256 mismatch: {archive}")
        with tarfile.open(archive) as tar:
            tar.extractall(work, filter="data")

    cmake = shutil.which("cmake")
    node = shutil.which("node")
    if not cmake or not node:
        raise RuntimeError("CMake and Node.js must be on PATH")
    generator = "Ninja" if shutil.which("ninja") else "Unix Makefiles"
    toolchain = sdk / "upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
    common = ["-G", generator, f"-DCMAKE_TOOLCHAIN_FILE={toolchain.as_posix()}",
              "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"]
    jobs = str(min(os.cpu_count() or 1, 4))
    de265 = work / "libde265-1.1.1"
    heif = work / "libheif-1.23.4"
    de265_build = work / "de265-build"
    heif_build = work / "heif-build"
    prefix = work / "install"
    run(cmake, "-S", de265, "-B", de265_build, *common,
        f"-DCMAKE_INSTALL_PREFIX={prefix.as_posix()}", "-DCMAKE_INSTALL_LIBDIR=lib", "-DENABLE_SDL=OFF",
        "-DENABLE_SIMD=OFF", "-DENABLE_DECODER=OFF", "-DENABLE_ENCODER=OFF")
    run(cmake, "--build", de265_build, "--parallel", jobs)
    run(cmake, "--install", de265_build)
    library = prefix / "lib/libde265.a"
    heif_flags = [f"-DWITH_{option}=OFF" for option in HEIF_DISABLED] + [
        "-DWITH_LIBDE265=ON", "-DWITH_LIBDE265_PLUGIN=OFF",
        "-DENABLE_PLUGIN_LOADING=OFF", "-DENABLE_MULTITHREADING_SUPPORT=OFF",
        "-DENABLE_PARALLEL_TILE_DECODING=OFF", "-DBUILD_TESTING=OFF",
        "-DBUILD_DOCUMENTATION=OFF", "-DBUILD_DEVELOPMENT_TOOLS=OFF",
        f"-DLIBDE265_INCLUDE_DIR={prefix.as_posix()}/include",
        f"-DLIBDE265_LIBRARY={library.as_posix()}",
    ]
    run(cmake, "-S", heif, "-B", heif_build, *common, *heif_flags)
    run(cmake, "--build", heif_build, "--target", "heif", "--parallel", jobs)
    module = work / "libheif.mjs"
    run(sys.executable, emcc, "-Wl,--whole-archive", heif_build / "libheif/libheif.a",
        "-Wl,--no-whole-archive", library, "--post-js", heif / "post.js",
        *LINK_FLAGS, "-o", module)

    # This is an ordinary initialization smoke, with no media or exploit input.
    run(node, "--input-type=module", "-e", """
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { default: createHeif } = await import(pathToFileURL(process.argv[1]));
const heif = await createHeif({ wasmBinary: readFileSync(process.argv[2]) });
if (heif.heif_get_version() !== '1.23.4' || heif._de265_get_version_number() !== 0x01010100 ||
    typeof heif.HeifDecoder !== 'function')
  throw new Error('Unexpected libheif runtime');
console.log('Verified libheif ' + heif.heif_get_version() + ', libde265 1.1.1');
""", module, work / "libheif.wasm")
    license_path = work / "LICENSE"
    license_path.write_text("\n\n".join(
        f"{name} {source['version']}\n{source['url']}\n\n"
        + (work / f"{name}-{source['version']}" / "COPYING").read_text(encoding="utf-8")
        for name, source in SOURCES.items()), encoding="utf-8")
    artifacts = {name: sha256(work / name) for name in ("libheif.mjs", "libheif.wasm", "LICENSE")}
    manifest = {
        "libheif": "1.23.4", "libde265": "1.1.1", "emscripten": EMSCRIPTEN,
        "sources": SOURCES, "decoder": "libde265", "threading": False,
        "dynamicExecution": False, "pluginLoading": False,
        "cmakeFlags": [flag for flag in heif_flags if not flag.startswith("-DLIBDE265_")],
        "linkFlags": LINK_FLAGS, "artifacts": artifacts,
    }
    (work / "build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    args.output.mkdir(parents=True, exist_ok=True)
    for name in [*artifacts, "build-manifest.json"]:
        shutil.copyfile(work / name, args.output / name)
    print(f"Verified HEIF artifacts: {args.output.resolve()}", flush=True)


if __name__ == "__main__":
    main()
