/** Native Blender gets OS/render settings, never website or worker credentials. */
export function blenderEnvironment(source = process.env) {
  const names = ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','windir','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','LANG','LANGUAGE','LC_ALL','OMP_NUM_THREADS','AMES_CAD_RENDER_SIZE','AMES_CAD_RENDER_SAMPLES','AMES_CAD_DENOISE'];
  return Object.fromEntries(names.filter(name => typeof source[name] === 'string').map(name => [name, source[name]]));
}
