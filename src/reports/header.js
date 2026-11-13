import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';

/** Build shared report labels from the room's effective settings. */
export function reportHeader({ project, room, settings, revision, date = new Date() }) {
  const report = settings.report;
  const jobNumber = report.jobNumber.trim();
  const faceFrame = [14, 15].includes(settings.defaultStyle.cabinetStyleId);
  const roomName = room.name.toUpperCase() + (faceFrame ? ' - FACE FRAME' : '');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {
    job: project?.name ?? '',
    jobNumber,
    address: project?.address ?? '',
    room: roomName,
    faceFrame,
    drawerBoxOrder: { ...DEFAULT_SETTINGS.drawerBoxOrder, ...settings.drawerBoxOrder },
    orderRoom: jobNumber ? `${jobNumber} ${roomName}` : roomName,
    wood: report.wood + (report.wireBrushed ? ' - WIRE BRUSHED' : ''),
    finish: report.finish,
    boxes: report.boxMaterial,
    edgebandAlert: report.edgebandAlert.trim() || null,
    company: {
      name: report.companyName,
      address: report.companyAddress,
      city: report.companyCity,
      state: report.companyState,
      zip: report.companyZip,
      phone: report.companyPhone,
      fax: report.companyFax,
    },
    date: `${month}/${day}/${date.getFullYear()}`,
    revision,
  };
}
