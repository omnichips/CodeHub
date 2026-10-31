// Media file types, shared by background.js (importScripts) and the popup. The content scripts keep their own
// copy of the video list (test.js checks it matches), since they cannot rely on globals from another file.
const __vsniffTypes = { mp4: 'MP4', m4v: 'MP4', mov: 'MP4', webm: 'WEBM', m3u8: 'HLS', mpd: 'DASH', m4a: 'AUDIO', mp3: 'AUDIO', aac: 'AUDIO', ts: 'SEG', m4s: 'SEG' };
// Whole videos and playlists: what page scripts, page text and pasted links are checked for (not segments or audio).
// A row leaves the list this long after its video was last seen (an active download keeps it). Saved files stay.
const __vsniffRowLife = 5 * 60e3;
const __vsniffVideoExt = Object.keys(__vsniffTypes).filter((e) => ['MP4', 'WEBM', 'HLS', 'DASH'].includes(__vsniffTypes[e])).join('|');
