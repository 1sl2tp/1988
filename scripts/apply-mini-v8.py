from pathlib import Path

target = Path("scripts/build-kira-proof.sh")
text = target.read_text()
marker = "# Keep attribution and a machine-readable build marker without changing the UI."
sentinel = "# 1988 mini v8: persistent playback while collapsed and replace-in-place."

if sentinel in text:
    raise SystemExit(0)
if marker not in text:
    raise SystemExit("build marker not found")

block = r'''
# 1988 mini v8: persistent playback while collapsed and replace-in-place.

p = Path("src/App.vue")
s = p.read_text()

s = s.replace(
    '<div v-if="!miniCollapsed" class="mini-player"><VideoPlayer :video-id="miniVideo.videoId"/></div>',
    '<div class="mini-player" :class="{ \'mini-hidden\': miniCollapsed }"><VideoPlayer :video-id="miniVideo.videoId"/></div>',
    1
)

if "function playInExistingMini" not in s:
    s = s.replace(
        """function closeMini() {
  miniVideo.value = null;
  miniCollapsed.value = false;
}
function openMiniWatch() {""",
        """function closeMini() {
  miniVideo.value = null;
  miniCollapsed.value = false;
}

function playInExistingMini(data: any) {
  if (!miniVideo.value || !data?.videoId) return false;
  const keepCollapsed = miniCollapsed.value;
  miniVideo.value = data;
  miniCollapsed.value = keepCollapsed;
  return true;
}

function openMiniWatch() {""",
        1
    )

if "provide('1988PlayInExistingMini'" not in s:
    s = s.replace(
        "provide('1988OpenMini', openMini);",
        "provide('1988OpenMini', openMini);\nprovide('1988PlayInExistingMini', playInExistingMini);",
        1
    )

if ".mini-player.mini-hidden" not in s:
    s = s.replace(
        ".mini-player :deep(.video-player) { width:100%; height:100%; }",
        """.mini-player :deep(.video-player) { width:100%; height:100%; }
.mini-player.mini-hidden {
  position:absolute;
  left:0;
  bottom:0;
  width:1px;
  height:1px;
  min-width:1px;
  min-height:1px;
  aspect-ratio:auto;
  overflow:hidden;
  opacity:0;
  pointer-events:none;
}
.mini-player.mini-hidden :deep(.video-player) {
  width:1px !important;
  height:1px !important;
  min-width:1px !important;
  min-height:1px !important;
}""",
        1
    )

p.write_text(s)


p = Path("src/components/GridVideoItem.vue")
s = p.read_text()

s = s.replace(
    '<router-link class="thumb-link" :to="watchTarget">',
    '<router-link class="thumb-link" :to="watchTarget" @click.capture="handlePrimaryClick">',
    1
)
s = s.replace(
    '<router-link class="title-link" :to="watchTarget"><h3 v-html="data.title"/></router-link>',
    '<router-link class="title-link" :to="watchTarget" @click.capture="handlePrimaryClick"><h3 v-html="data.title"/></router-link>',
    1
)

if "const playInExistingMini" not in s:
    s = s.replace(
        "const openMini = inject<((data: any) => void) | null>('1988OpenMini', null);",
        """const openMini = inject<((data: any) => void) | null>('1988OpenMini', null);
const playInExistingMini = inject<((data: any) => boolean) | null>('1988PlayInExistingMini', null);""",
        1
    )

if "function handlePrimaryClick" not in s:
    s = s.replace(
        "const watchTarget = computed(() => {",
        """function handlePrimaryClick(event: MouseEvent) {
  if (!playInExistingMini?.(props.data)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

const watchTarget = computed(() => {""",
        1
    )

p.write_text(s)
'''

target.write_text(text.replace(marker, block + "\n" + marker, 1))
