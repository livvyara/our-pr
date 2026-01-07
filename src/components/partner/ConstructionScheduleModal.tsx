import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc, setDoc, getDocs, where
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useReactToPrint } from 'react-to-print';
import logoSrc from '../../assets/logo.png';
import './ConstructionScheduleModal.css';

// --- [Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Print: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>,
  Settings: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Upload: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Alert: () => <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Image: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Check: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
};

// Types
interface ScheduleEntry { id: string; date: string; processes: string[]; isNoisy: boolean; createdAt: Timestamp; siteName: string; }
interface NoticeSettings { companyName: string; complaintContact: string; managerContact: string; blogUrl: string; instaUrl: string; youtubeUrl: string; logoUrl: string; }
interface ContractInfo { siteType: 'apartment' | 'residential' | 'commercial'; address: string; aptName?: string; aptDong?: string; aptHo?: string; startDate?: string; endDate?: string; }
interface FileEntry { id: string; url: string; name: string; category: string; } // For Rendering Print
interface ModalProps { siteId: string; partnerUid: string; onClose: () => void; viewOnly?: boolean; }

// Utils
const getProcessColor = (str: string) => {
  const palettes = [
    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
    { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    { bg: '#FAF5FF', border: '#E9D5FF', text: '#7E22CE' },
    { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' }
  ];
  let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palettes[Math.abs(hash % palettes.length)];
};

const parseProcesses = (text: string): string[] => text.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 7);

const ConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose, viewOnly = false }) => {
  const db = getFirestore();
  const storage = getStorage();
  
  // Schedule State
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [currentSiteName, setCurrentSiteName] = useState('현장');
  const [siteStartDate, setSiteStartDate] = useState<string>(''); 
  const [siteEndDate, setSiteEndDate] = useState<string>(''); 
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [inputDateStart, setInputDateStart] = useState(''); 
  const [inputDateEnd, setInputDateEnd] = useState('');
  const [processesText, setProcessesText] = useState('');
  const [isNoisy, setIsNoisy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showNoticeSettings, setShowNoticeSettings] = useState(false);
  const [noticeSettings, setNoticeSettings] = useState<NoticeSettings>({ companyName: '', complaintContact: '', managerContact: '', blogUrl: '', instaUrl: '', youtubeUrl: '', logoUrl: '' });
  
  // Rendering Print State
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderFiles, setRenderFiles] = useState<FileEntry[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [renderLogoUrl, setRenderLogoUrl] = useState<string>('');
  
  const logoInputRef = useRef<HTMLInputElement>(null); // For Notice
  const renderLogoInputRef = useRef<HTMLInputElement>(null); // For Rendering
  const schedulePrintRef = useRef<HTMLDivElement>(null);
  const noticePrintRef = useRef<HTMLDivElement>(null);
  const renderPrintRef = useRef<HTMLDivElement>(null);

  // Fetch Logic
  useEffect(() => {
    if (!siteId || !partnerUid) return;
    const fetchData = async () => {
      try {
        const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        if (siteDoc.exists()) {
            const data = siteDoc.data();
            setCurrentSiteName(data.siteName || '현장');
            let sDate = data.startDate || new Date().toISOString().split('T')[0];
            let eDate = data.endDate || '';
            if (data.contract) {
                const cInfo = data.contract as ContractInfo;
                setContractInfo(cInfo);
                if (cInfo.startDate) sDate = cInfo.startDate;
                if (cInfo.endDate) eDate = cInfo.endDate;
            }
            setSiteStartDate(sDate); setSiteEndDate(eDate);
            setInputDateStart(sDate); setInputDateEnd(eDate);
        }
        const noticeDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'));
        if (noticeDoc.exists()) setNoticeSettings(noticeDoc.data() as NoticeSettings);
      } catch (e) { console.error(e); }

      const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), orderBy('date', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: ScheduleEntry[] = [];
        snapshot.forEach(doc => { list.push({ id: doc.id, ...doc.data() } as ScheduleEntry); });
        setSchedules(list);
      });
      return () => unsubscribe();
    };
    fetchData();
  }, [siteId, partnerUid, db]);

  // [UPDATED] Fetch Render Files: Filter by Category '3d-render' at Database Level
  useEffect(() => {
      if (showRenderModal) {
          const fetchRenderData = async () => {
              try {
                  // Fetch Config for Render Logo
                  const configDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'rendering'));
                  if (configDoc.exists()) {
                      setRenderLogoUrl(configDoc.data().logoUrl || '');
                  }
                  
                  // [OPTIMIZATION] Filter only '3d-render' category
                  const filesQuery = query(
                      collection(db, 'users', partnerUid, 'sites', siteId, 'files'), 
                      where('category', '==', '3d-render'),
                      orderBy('createdAt', 'desc')
                  );
                  
                  const snapshot = await getDocs(filesQuery);
                  const files: FileEntry[] = [];
                  snapshot.forEach(d => files.push({ id: d.id, ...d.data() } as FileEntry));
                  
                  setRenderFiles(files);
              } catch (e) { console.error("Error fetching render files:", e); }
          };
          fetchRenderData();
      }
  }, [showRenderModal, siteId, partnerUid, db]);

  // Handlers
  const handleEdit = (schedule: ScheduleEntry) => {
    if (viewOnly) return; 
    setIsEditing(true); setEditId(schedule.id); 
    setInputDateStart(schedule.date); setInputDateEnd(''); 
    setProcessesText(schedule.processes.join(', ')); setIsNoisy(schedule.isNoisy);
  };

  const handleDelete = async () => {
    if (!isEditing || !editId || !window.confirm("정말 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'schedules', editId)); handleCancelEdit(); } catch (e) { console.error(e); }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const processes = parseProcesses(processesText);
    if (processes.length === 0) return alert("공정 내용을 입력해주세요.");
    setIsSubmitting(true);
    try {
      if (isEditing && editId) {
        await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'schedules', editId), { date: inputDateStart, processes, isNoisy });
      } else {
        const datesToSave = [];
        let cur = new Date(inputDateStart);
        const end = new Date(inputDateEnd || inputDateStart);
        while (cur <= end) { datesToSave.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
        await Promise.all(datesToSave.map(date => addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), { date, processes, isNoisy, createdAt: serverTimestamp() })));
      }
      handleCancelEdit();
    } catch (e) { console.error(e); alert("오류 발생"); } 
    finally { setIsSubmitting(false); }
  };

  const handleCancelEdit = () => {
    setIsEditing(false); setEditId(null); setProcessesText(''); setIsNoisy(false); 
    setInputDateEnd(siteEndDate); setInputDateStart(siteStartDate);
  };
  
  // Notice Settings
  const handleNoticeSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; setNoticeSettings(prev => ({ ...prev, [name]: value })); };
  const saveNoticeSettings = async () => { try { await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), noticeSettings, { merge: true }); setShowNoticeSettings(false); } catch (e) { console.error(e); } };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { 
      if (!e.target.files || e.target.files.length === 0) return; 
      const file = e.target.files[0]; 
      const fileRef = storageRef(storage, `sites/${siteId}/notice_logo_${Date.now()}`); 
      try { 
          const result = await uploadBytes(fileRef, file); 
          const url = await getDownloadURL(result.ref); 
          setNoticeSettings(prev => ({ ...prev, logoUrl: url })); 
          await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), { logoUrl: url }, { merge: true }); 
      } catch (err) { console.error(err); } 
  };

  // Rendering Print Handlers
  const handleToggleFileSelection = (fileId: string) => {
      setSelectedFileIds(prev => {
          const next = new Set(prev);
          if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
          return next;
      });
  };
  
  const handleRenderLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const fileRef = storageRef(storage, `sites/${siteId}/rendering_logo_${Date.now()}`);
      try {
          const result = await uploadBytes(fileRef, file);
          const url = await getDownloadURL(result.ref);
          setRenderLogoUrl(url);
          // Save for persistent use
          await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'rendering'), { logoUrl: url }, { merge: true });
      } catch (err) { console.error(err); } 
  };

  // [UPDATED] Print Logic - Default to Landscape A4
  const handlePrintRender = useReactToPrint({
      contentRef: renderPrintRef,
      documentTitle: `${currentSiteName}_렌더링`,
      pageStyle: `
        @page { size: landscape; margin: 0; }
        @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .render-print-page { page-break-after: always; width: 100vw; height: 100vh; overflow: hidden; position: relative; display: flex; justify-content: center; align-items: center; background: #fff; }
            .render-main-img { width: 100%; height: 100%; object-fit: contain; }
            .render-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 25%; opacity: 0.6; z-index: 10; pointer-events: none; filter: grayscale(100%); }
        }
      `
  });

  // Print Logic (Schedule & Notice)
  const handlePrintSchedule = useReactToPrint({ 
    contentRef: schedulePrintRef, 
    documentTitle: `${currentSiteName}_공사일정표`, 
    pageStyle: `
      @page { size: landscape; margin: 10mm; } 
      @media print { body { -webkit-print-color-adjust: exact; } }
    ` 
  });
  const handlePrintNotice = useReactToPrint({ 
    contentRef: noticePrintRef, 
    documentTitle: `${currentSiteName}_공사안내문`, 
    pageStyle: `
      @page { size: portrait; margin: 0mm; } 
      @media print { 
        body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; } 
        html, body { height: 100%; width: 100%; margin: 0; padding: 0; }
      }
    ` 
  });

  // Data Generation
  const generateCalendarData = () => {
      const baseStart = siteStartDate ? new Date(siteStartDate) : new Date();
      const calendarStart = new Date(baseStart);
      calendarStart.setDate(baseStart.getDate() - baseStart.getDay());
      let calendarEnd = siteEndDate ? new Date(siteEndDate) : new Date(baseStart);
      if (!siteEndDate) calendarEnd.setDate(calendarEnd.getDate() + 35);
      const endDay = calendarEnd.getDay();
      calendarEnd.setDate(calendarEnd.getDate() + (6 - endDay));
      const weeks = [];
      let current = new Date(calendarStart);
      while (current <= calendarEnd) {
          const week = [];
          for (let i = 0; i < 7; i++) {
              const dateStr = current.toISOString().split('T')[0];
              const dailySchedules = schedules.filter(s => s.date === dateStr);
              week.push({ dateStr, dayNum: current.getDate(), schedules: dailySchedules });
              current.setDate(current.getDate() + 1);
          }
          weeks.push(week);
      }
      return weeks;
  };
  const allWeeks = generateCalendarData();
  const dateRangeString = (siteStartDate && siteEndDate) ? `${siteStartDate} ~ ${siteEndDate}` : '';

  const getNoticeContent = () => { 
      const period = (siteStartDate && siteEndDate) ? `${siteStartDate} ~ ${siteEndDate}` : '일정 미정';
      let locationText = `[${currentSiteName}]`; let projectName = `${currentSiteName} 인테리어 공사`;
      if (contractInfo) {
          if (contractInfo.siteType === 'apartment') {
              const apt = contractInfo.aptName || ''; const dong = contractInfo.aptDong ? `${contractInfo.aptDong}동` : ''; const ho = contractInfo.aptHo ? `${contractInfo.aptHo}호` : '';
              locationText = `${dong} ${ho}`.trim() || apt;
              const fullAptName = `${apt} ${dong} ${ho}`.trim(); if (fullAptName) projectName = `${fullAptName} 인테리어 공사`;
          } else { locationText = contractInfo.address || locationText; }
      }
      const company = noticeSettings.companyName || '[시공사]';
      return { period, locationText, company, projectName };
  };
  const noticeContent = getNoticeContent();

  const rowsPerPage = 5;
  const printPages: (typeof allWeeks[0] | null)[][] = [];
  for (let i = 0; i < allWeeks.length; i += rowsPerPage) {
      const chunk: (typeof allWeeks[0] | null)[] = allWeeks.slice(i, i + rowsPerPage);
      while (chunk.length < rowsPerPage) chunk.push(null);
      printPages.push(chunk);
  }

  return (
    <div className={`ppm-overlay ${viewOnly ? 'view-only' : ''}`}>
      <div className="ppm-container schedule-mode">
        
        {/* === Sidebar (Left / Mobile Top) === */}
        {!viewOnly && (
            <div className="ppm-sidebar">
                <div className="ppm-sidebar-header">
                    <div style={{flex: 1}}>
                        <h3 className="ppm-sidebar-title">일정 관리</h3>
                        <div className="ppm-sidebar-desc">드래그 없이 클릭 한 번으로 관리가 가능합니다.</div>
                    </div>
                    {/* [Mobile ONLY Close Button] */}
                    <button className="ppm-close-mobile-btn" onClick={onClose} aria-label="닫기">
                        <Icons.Close />
                    </button>
                </div>

                <form onSubmit={handleSave}>
                    <div className="ppm-form-group">
                        <label className="ppm-label">날짜 선택</label>
                        <div className="ppm-row-2">
                            <input type="date" className="ppm-input" value={inputDateStart} onChange={e => setInputDateStart(e.target.value)} required />
                            {!isEditing && <input type="date" className="ppm-input" value={inputDateEnd} onChange={e => setInputDateEnd(e.target.value)} />}
                        </div>
                    </div>

                    <div className="ppm-form-group">
                        <label className="ppm-label">공정 내용</label>
                        <input type="text" className="ppm-input" value={processesText} onChange={e => setProcessesText(e.target.value)} placeholder="예: 철거, 목공 (쉼표로 구분)" required />
                    </div>

                    <div className="ppm-form-group">
                        <div className={`ppm-check-card ${isNoisy ? 'checked' : ''}`} onClick={() => setIsNoisy(!isNoisy)}>
                            <input type="checkbox" className="ppm-checkbox" checked={isNoisy} readOnly />
                            <span className="ppm-check-label">소음 발생 주의 공정 (Badge 표시)</span>
                        </div>
                    </div>

                    <button type="submit" className="ppm-btn-primary" disabled={isSubmitting}>
                        {isEditing ? '수정 내용 저장' : '새 일정 등록'}
                    </button>
                    
                    {isEditing && (
                        <div className="ppm-row-2" style={{ marginTop: '12px' }}>
                            <button type="button" className="ppm-btn-secondary" onClick={handleCancelEdit}>취소</button>
                            <button type="button" className="ppm-btn-danger" onClick={handleDelete}>삭제</button>
                        </div>
                    )}
                </form>

                <div className="ppm-bottom-tools">
                    <div className="ppm-tool-label">DOCUMENTS & SETTINGS</div>
                    <div className="ppm-row-2">
                        <button className="ppm-btn-secondary" onClick={handlePrintSchedule}><Icons.Print /> 일정표</button>
                        <button className="ppm-btn-secondary" onClick={handlePrintNotice}><Icons.Print /> 안내문</button>
                    </div>
                    
                    <button className="ppm-btn-secondary" onClick={() => setShowRenderModal(true)} style={{width:'100%'}}>
                        <Icons.Image /> 3D 렌더링 출력
                    </button>

                    <button className="ppm-btn-secondary" onClick={() => setShowNoticeSettings(true)} style={{width:'100%'}}>
                        <Icons.Settings /> 설정
                    </button>
                    
                    <div className="ppm-dropzone" onClick={() => logoInputRef.current?.click()}>
                        <div style={{display:'flex',justifyContent:'center'}}><Icons.Upload /></div>
                        <span className="ppm-dropzone-text">로고 업로드 (Drag & Drop)</span>
                    </div>
                    <input type="file" ref={logoInputRef} style={{display:'none'}} accept="image/*" onChange={handleLogoUpload} />
                </div>
            </div>
        )}

        {/* === Main Content (Right / Mobile Bottom) === */}
        <div className="ppm-content-view">
            <div className="ppm-view-header">
                <div>
                    <h2 className="ppm-view-title">{currentSiteName}</h2>
                    <span className="ppm-view-period">{dateRangeString || '일정 미정'}</span>
                </div>
                {/* [PC ONLY Close Button] */}
                <button className="ppm-close-icon" onClick={onClose} aria-label="닫기">
                    <Icons.Close />
                </button>
            </div>

            {/* Mobile View Header */}
            {viewOnly && (
                <div className="ppm-mobile-view-only-header">
                    <h3>{currentSiteName}</h3>
                    <button className="ppm-close-mobile-btn show" onClick={onClose}><Icons.Close /></button>
                </div>
            )}

            {/* Desktop Calendar */}
            <div className="ppm-calendar-container">
                <table className="ppm-cal-table">
                    <thead>
                        <tr>
                            <th className="ppm-cal-th">일</th><th className="ppm-cal-th">월</th><th className="ppm-cal-th">화</th><th className="ppm-cal-th">수</th><th className="ppm-cal-th">목</th><th className="ppm-cal-th">금</th><th className="ppm-cal-th">토</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allWeeks.map((week, wIdx) => (
                            <tr key={wIdx}>
                                {week.map((day, dIdx) => (
                                    <td key={dIdx} className="ppm-cal-td" onClick={() => {}}>
                                        <div style={{display:'flex', justifyContent:'space-between'}}>
                                            <span className={`ppm-day-num ${dIdx===0?'sun':dIdx===6?'sat':''}`}>{day.dayNum}</span>
                                            {day.schedules.some((s:any) => s.isNoisy) && <span className="ppm-badge-noise"><Icons.Alert /> 소음</span>}
                                        </div>
                                        {day.schedules.map((sched: any) => (
                                            <div key={sched.id} onClick={(e) => { e.stopPropagation(); handleEdit(sched); }}>
                                                {sched.processes.map((proc: string, pIdx: number) => {
                                                    const style = getProcessColor(proc);
                                                    return (
                                                        <span key={pIdx} className="ppm-proc-chip" style={{backgroundColor:style.bg, color:style.text, border:`1px solid ${style.border}`}}>
                                                            {proc}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        ))}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile List View */}
            <div className="ppm-mobile-list">
                {schedules.map((sched) => {
                    const d = new Date(sched.date);
                    const dayNum = d.getDay();
                    const dayStr = ['일','월','화','수','목','금','토'][dayNum];
                    return (
                        <div key={sched.id} className="ppm-m-card" onClick={() => handleEdit(sched)}>
                            <div className="ppm-m-head">
                                <span style={{color: dayNum===0?'#ef4444':dayNum===6?'#3182F6':'#333'}}>
                                    {sched.date} ({dayStr})
                                </span>
                                {sched.isNoisy && <span className="ppm-badge-noise">소음발생</span>}
                            </div>
                            <div className="ppm-m-body">
                                {sched.processes.map((proc, idx) => {
                                    const style = getProcessColor(proc);
                                    return <span key={idx} className="ppm-proc-chip" style={{backgroundColor:style.bg, color:style.text, border:`1px solid ${style.border}`}}>{proc}</span>
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
            
            <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '20px' }}>
                <img src={logoSrc} alt="OurProject" style={{height:'20px', filter:'grayscale(100%)'}} />
            </div>
        </div>
      </div>

      {/* Notice Settings Modal */}
      {showNoticeSettings && (
          <div className="ppm-settings-overlay">
            <div className="ppm-settings-modal">
                <div className="ppm-settings-header">
                    <h3 className="ppm-settings-title">안내문 정보 설정</h3>
                    <button onClick={()=>setShowNoticeSettings(false)} style={{background:'none',border:'none',cursor:'pointer'}}><Icons.Close /></button>
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                    <div><label className="ppm-label">회사명</label><input name="companyName" value={noticeSettings.companyName} onChange={handleNoticeSettingChange} className="ppm-input" /></div>
                    <div><label className="ppm-label">불편 신고 연락처</label><input name="complaintContact" value={noticeSettings.complaintContact} onChange={handleNoticeSettingChange} className="ppm-input" /></div>
                    <div><label className="ppm-label">현장 책임자</label><input name="managerContact" value={noticeSettings.managerContact} onChange={handleNoticeSettingChange} className="ppm-input" /></div>
                    <button className="ppm-btn-primary" onClick={saveNoticeSettings}>저장 완료</button>
                </div>
            </div>
          </div>
      )}

      {/* [NEW] Rendering Print Modal Overlay (Simplified) */}
      {showRenderModal && (
          <div className="ppm-render-overlay">
              <div className="ppm-render-modal">
                  <div className="ppm-render-header">
                      <h3>3D 렌더링 출력</h3>
                      <button onClick={() => setShowRenderModal(false)} className="close-btn"><Icons.Close /></button>
                  </div>
                  
                  <div className="ppm-render-body">
                      {/* Sidebar for Render Settings */}
                      <div className="ppm-render-sidebar">
                          <div className="setting-group">
                              <label>회사 로고 (워터마크)</label>
                              <div className="logo-preview-box" onClick={() => renderLogoInputRef.current?.click()}>
                                  {renderLogoUrl ? <img src={renderLogoUrl} alt="Logo" /> : <div className="placeholder"><Icons.Upload /> 로고 업로드</div>}
                              </div>
                              <input type="file" ref={renderLogoInputRef} style={{display:'none'}} accept="image/*" onChange={handleRenderLogoUpload} />
                              <p className="help-text">등록된 로고는 계속 저장됩니다.</p>
                          </div>

                          <div className="selected-count">
                              선택된 이미지: <strong>{selectedFileIds.size}</strong>장
                          </div>
                          <button className="ppm-btn-primary" onClick={handlePrintRender} disabled={selectedFileIds.size === 0}>
                              <Icons.Print /> 출력하기
                          </button>
                      </div>

                      {/* Image Grid */}
                      <div className="ppm-render-grid-area">
                          {renderFiles.length === 0 ? (
                              <div className="empty-msg">등록된 3D 렌더링 이미지가 없습니다.</div>
                          ) : (
                              <div className="ppm-render-grid">
                                  {renderFiles.map(file => (
                                      <div 
                                          key={file.id} 
                                          className={`ppm-render-item ${selectedFileIds.has(file.id) ? 'selected' : ''}`}
                                          onClick={() => handleToggleFileSelection(file.id)}
                                      >
                                          <img src={file.url} alt={file.name} loading="lazy" />
                                          <div className="check-overlay"><Icons.Check /></div>
                                          <span className="file-name">{file.name}</span>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

     {/* Print Templates (Hidden) */}
      <div className="ppm-print-container">
          {/* Schedule Template */}
          <div ref={schedulePrintRef}>
              {printPages.map((weeksChunk, pageIndex) => (
                  <div key={pageIndex} className="ppm-print-doc landscape">
                      <div className="print-header">
                          <h1>{currentSiteName} 공사 일정표</h1>
                          <p>{dateRangeString}</p>
                      </div>
                      <div className="print-grid-wrap">
                          <div className="print-grid-head">
                              <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
                          </div>
                          <div className="print-grid-body">
                              {weeksChunk.map((week, wIdx) => (
                                  <div key={wIdx} className="print-row">
                                      {week === null ? Array(7).fill(null).map((_,i)=><div key={i} className="print-cell empty"></div>) : week.map((day, dIdx) => {
                                          if(!day) return <div key={dIdx} className="print-cell empty"></div>;
                                          return (
                                              <div key={dIdx} className="print-cell">
                                                  <div className={`print-day ${dIdx===0?'sun':dIdx===6?'sat':''}`}>
                                                      {day.dayNum}
                                                      {day.schedules.some((s:any)=>s.isNoisy) && <span className="print-noise">소음</span>}
                                                  </div>
                                                  <div className="print-content">
                                                    {day.schedules.map((s:any) => s.processes.map((p:string, pi:number) => (
                                                        <span key={pi} className="print-tag">{p}</span>
                                                    )))}
                                                  </div>
                                              </div>
                                          )
                                      })}
                                  </div>
                              ))}
                          </div>
                      </div>
                      <div className="print-footer">
                         <img src={logoSrc} />
                      </div>
                  </div>
              ))}
          </div>

          {/* Notice Template */}
          <div ref={noticePrintRef}>
            <div className="ppm-premium-notice-wrap">
                <div className="ppm-premium-notice-page">
                    <header className="ppm-premium-notice-header">
                        <div className="header-titles">
                            <span className="ppm-premium-notice-subtitle">INTERIOR WORK NOTICE</span>
                            <h1 className="ppm-premium-notice-title">인테리어 공사 안내문</h1>
                        </div>
                        <div className="ppm-premium-notice-top-bar"></div>
                    </header>

                    <main className="ppm-premium-notice-body">
                        <div className="ppm-premium-notice-message">
                            <p>
                                <strong>입주민 여러분, 안녕하십니까.</strong><br />
                                품격 있는 주거 공간을 위한 인테리어 공사가 예정되어 있어 안내 말씀 드립니다.
                            </p>
                            <p>
                                공사 기간 중 발생하는 소음과 분진 등으로 인해 다소 불편하시더라도
                                입주민 여러분의 너그러운 양해를 부탁드립니다.<br />
                                <strong>{noticeSettings.companyName || '시공사'}</strong>는 이웃분들의 불편을 최소화하기 위해
                                안전하고 신속하게 공사를 마무리하겠습니다.
                            </p>
                        </div>

                        <div className="ppm-premium-notice-grid">
                            <div className="ppm-premium-notice-row">
                                <div className="ppm-premium-notice-label">공 사 명</div>
                                <div className="ppm-premium-notice-value">{noticeContent.projectName}</div>
                            </div>
                            <div className="ppm-premium-notice-row">
                                <div className="ppm-premium-notice-label">공사 기간</div>
                                <div className="ppm-premium-notice-value period">{noticeContent.period}</div>
                            </div>
                            <div className="ppm-premium-notice-row">
                                <div className="ppm-premium-notice-label">장 소</div>
                                <div className="ppm-premium-notice-value">{noticeContent.locationText}</div>
                            </div>
                            <div className="ppm-premium-notice-contact-box">
                                <div className="contact-item">
                                    <span className="contact-label">현장 책임자</span>
                                    <span className="contact-value">{noticeSettings.managerContact || '-'}</span>
                                </div>
                                <div className="contact-divider"></div>
                                <div className="contact-item highlight">
                                    <span className="contact-label">불편 문의</span>
                                    <span className="contact-value">{noticeSettings.complaintContact || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </main>

                    <footer className="ppm-premium-notice-footer">
                        <div className="ppm-premium-notice-sign">
                            <p className="ppm-premium-notice-closing">감사합니다.</p>
                            <span className="name">{noticeSettings.companyName || '시공사'}</span>
                        </div>
                        <div className="ppm-premium-bottom-branding">
                            <p className="brand-slogan">소비자의 안전한 공사를 위한 플랫폼</p>
                            <p className="brand-name-bold">아워프로젝트</p>
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://our-pr.com" className="brand-qr" alt="QR Code" />
                        </div>
                    </footer>
                </div>
            </div>
          </div>

          {/* [NEW] Rendering Print Template (Always Landscape) */}
          <div ref={renderPrintRef}>
              {renderFiles.filter(f => selectedFileIds.has(f.id)).map(file => (
                  <div key={file.id} className="render-print-page">
                      {/* Full size image (contain) */}
                      <img src={file.url} className="render-main-img" alt="Rendering" />
                      {/* Centered Watermark Logo */}
                      {renderLogoUrl && <img src={renderLogoUrl} className="render-watermark" alt="Logo" />}
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
};

export default ConstructionScheduleModal;