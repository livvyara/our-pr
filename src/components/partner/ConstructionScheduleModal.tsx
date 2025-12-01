import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc, setDoc 
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useReactToPrint } from 'react-to-print';
import { QRCodeCanvas } from 'qrcode.react';
import logoSrc from '../../assets/logo.png'; 
import './ConstructionScheduleModal.css'; 

// (Icons, OurProjectFooter, Interfaces ... 기존 코드 유지)
const Icons = { /* ... 기존과 동일 (생략 없이 복사) ... */
  NaverBlog: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3H21V21H3V3Z" fill="#03C75A"/><path d="M7.5 7.5H10.5L13.5 11.8V7.5H16.5V16.5H13.5L10.5 12.2V16.5H7.5V7.5Z" fill="white"/></svg>),
  Instagram: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M7.5 2C4.462 2 2 4.462 2 7.5V16.5C2 19.538 4.462 22 7.5 22H16.5C19.538 22 22 19.538 22 16.5V7.5C22 4.462 19.538 2 16.5 2H7.5ZM16.5 3.833C18.525 3.833 20.167 5.475 20.167 7.5V16.5C20.167 18.525 18.525 20.167 16.5 20.167H7.5C5.475 20.167 3.833 18.525 3.833 16.5V7.5C3.833 5.475 5.475 3.833 7.5 3.833H16.5ZM12 7.042C9.261 7.042 7.042 9.261 7.042 12C7.042 14.739 9.261 16.958 12 16.958C14.739 16.958 16.958 14.739 16.958 12C16.958 9.261 14.739 7.042 12 7.042ZM17.208 5.875C17.208 6.381 16.798 6.792 16.292 6.792C15.786 6.792 15.375 6.381 15.375 5.875C15.375 5.369 15.786 4.958 16.292 4.958C16.798 4.958 17.208 5.369 17.208 5.875Z" fill="black"/></svg>),
  Youtube: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.582 5.093C21.328 4.143 20.584 3.398 19.634 3.144C17.915 2.684 12 2.684 12 2.684C12 2.684 6.085 2.684 4.366 3.144C3.416 3.398 2.671 4.143 2.417 5.093C1.957 6.812 1.957 10.4 1.957 10.4C1.957 10.4 1.957 13.989 2.417 15.707C2.671 16.657 3.416 17.402 4.366 17.656C6.085 18.116 12 18.116 12 18.116C12 18.116 17.915 18.116 19.634 17.656C20.584 17.402 21.328 16.657 21.582 15.707C22.042 13.989 22.042 10.4 22.042 10.4C22.042 6.812 21.582 5.093ZM9.645 13.78V7.02L15.576 10.4L9.645 13.78Z" fill="#FF0000"/></svg>)
};

const OurProjectFooter = () => (
  <div className="ourproject-footer">
    <img src={logoSrc} alt="OurProject" className="footer-logo-img" />
    <div className="footer-slogan">
      소비자의 안전한 인테리어 마무리를 위한 공사 진행 서포트 플랫폼, <strong>아워프로젝트</strong>
    </div>
  </div>
);

interface ScheduleEntry { id: string; date: string; processes: string[]; isNoisy: boolean; createdAt: Timestamp; siteName: string; }
interface NoticeSettings { companyName: string; complaintContact: string; managerContact: string; blogUrl: string; instaUrl: string; youtubeUrl: string; logoUrl: string; }
interface ContractInfo { siteType: 'apartment' | 'residential' | 'commercial'; address: string; aptName?: string; aptDong?: string; aptHo?: string; startDate?: string; endDate?: string; }

// [수정] viewOnly prop 추가
interface ModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
  viewOnly?: boolean; // 고객용 보기 모드
}

const parseProcesses = (text: string): string[] => text.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 7);
const getProcessColor = (str: string) => {
  const palettes = [{ bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' }, { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' }, { bg: '#fff3e0', border: '#ffcc80', text: '#ef6c00' }, { bg: '#f3e5f5', border: '#ce93d8', text: '#7b1fa2' }, { bg: '#e0f7fa', border: '#80deea', text: '#006064' }, { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' }];
  let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palettes[Math.abs(hash % palettes.length)];
};

const ConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose, viewOnly = false }) => {
  const db = getFirestore();
  const storage = getStorage();
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const schedulePrintRef = useRef<HTMLDivElement>(null);
  const noticePrintRef = useRef<HTMLDivElement>(null);
  const [schedulePaperSize, setSchedulePaperSize] = useState<'a4' | 'a3'>('a4');
  const [noticePaperSize, setNoticePaperSize] = useState<'a4' | 'a3'>('a4');

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

            // [중요] 계약 정보의 날짜 우선 적용
            if (data.contract) {
                const cInfo = data.contract as ContractInfo;
                setContractInfo(cInfo);
                if (cInfo.startDate) sDate = cInfo.startDate;
                if (cInfo.endDate) eDate = cInfo.endDate;
            }

            setSiteStartDate(sDate);
            setSiteEndDate(eDate);
            setInputDateStart(sDate);
            setInputDateEnd(eDate);
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

  const handleEdit = (schedule: ScheduleEntry) => {
    if (viewOnly) return; // [수정] 보기 전용이면 수정 불가
    setIsEditing(true); setEditId(schedule.id); setInputDateStart(schedule.date); setInputDateEnd(''); setProcessesText(schedule.processes.join(', ')); setIsNoisy(schedule.isNoisy);
  };
  const handleDelete = async () => {
    if (!isEditing || !editId || !window.confirm("삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'schedules', editId)); handleCancelEdit(); } catch (e) { console.error(e); }
  };
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const processes = parseProcesses(processesText);
    if (processes.length === 0) return alert("공정을 입력해주세요.");
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
      alert("저장되었습니다.");
    } catch (e) { console.error(e); alert("오류 발생"); } 
    finally { setIsSubmitting(false); }
  };
  const handleCancelEdit = () => {
    setIsEditing(false); setEditId(null); setProcessesText(''); setIsNoisy(false); 
    setInputDateEnd(siteEndDate); setInputDateStart(siteStartDate);
  };
  
  // ... (Notice 설정, 업로드, 인쇄 핸들러 등 기존 코드 유지) ...
  const handleNoticeSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; setNoticeSettings(prev => ({ ...prev, [name]: value })); };
  const saveNoticeSettings = async () => { try { await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), noticeSettings, { merge: true }); alert("저장 완료"); setShowNoticeSettings(false); } catch (e) { console.error(e); } };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { if (!e.target.files || e.target.files.length === 0) return; const file = e.target.files[0]; const fileRef = storageRef(storage, `sites/${siteId}/notice_logo_${Date.now()}`); try { const result = await uploadBytes(fileRef, file); const url = await getDownloadURL(result.ref); setNoticeSettings(prev => ({ ...prev, logoUrl: url })); await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), { logoUrl: url }, { merge: true }); alert("로고 등록 완료"); } catch (err) { console.error(err); } };
  const handlePrintSchedule = useReactToPrint({ contentRef: schedulePrintRef, documentTitle: `${currentSiteName}_공사일정표`, pageStyle: `@page { size: landscape; margin: 0; } @media print { body { -webkit-print-color-adjust: exact; } }` });
  const handlePrintNotice = useReactToPrint({ contentRef: noticePrintRef, documentTitle: `${currentSiteName}_공사안내문`, pageStyle: `@page { size: portrait; margin: 0; } @media print { body { -webkit-print-color-adjust: exact; } html, body { height: 100vh; } }` });

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
  const rowsPerPage = schedulePaperSize === 'a4' ? 5 : 6;
  const printPages: (typeof allWeeks[0] | null)[][] = [];
  for (let i = 0; i < allWeeks.length; i += rowsPerPage) {
      const chunk: (typeof allWeeks[0] | null)[] = allWeeks.slice(i, i + rowsPerPage);
      while (chunk.length < rowsPerPage) { chunk.push(null); }
      printPages.push(chunk);
  }
  const getNoticeContent = () => { /* (기존 로직 유지) */ 
      const period = (siteStartDate && siteEndDate) ? `${siteStartDate} ~ ${siteEndDate}` : '미정';
      let locationText = `[${currentSiteName}]`; let projectName = `${currentSiteName} 인테리어 공사`;
      if (contractInfo) {
          if (contractInfo.siteType === 'apartment') {
              const apt = contractInfo.aptName || ''; const dong = contractInfo.aptDong ? `${contractInfo.aptDong}동` : ''; const ho = contractInfo.aptHo ? `${contractInfo.aptHo}호` : '';
              locationText = `${dong} ${ho}`.trim(); if (!locationText) locationText = apt;
              const fullAptName = `${apt} ${dong} ${ho}`.trim(); if (fullAptName) projectName = `${fullAptName} 인테리어 공사`;
          } else { locationText = contractInfo.address || locationText; }
      }
      const company = noticeSettings.companyName || '[시공사]';
      return { period, locationText, company, projectName };
  };
  const noticeContent = getNoticeContent();

  return (
    <div className={`schedule-overlay ${viewOnly ? 'view-only' : ''}`}>
      <style>{`
          /* [NEW] 보기 전용 모드일 때 사이드바 숨김 및 전체 화면 사용 */
          .schedule-overlay.view-only .sidebar { display: none !important; }
          .schedule-overlay.view-only .schedule-modal { max-width: 100% !important; width: 95% !important; height: 95vh !important; }
          .schedule-overlay.view-only .screen-view { width: 100% !important; }
          .schedule-overlay.view-only .btn-close-modal { right: 30px; top: 20px; z-index: 2000; }
      `}</style>

      <div className="schedule-modal">
        <button className="btn-close-modal" onClick={onClose}>&times;</button>
        
        {/* 사이드바 (viewOnly가 아닐 때만 렌더링은 유지하되, CSS로 숨김 처리도 가능) */}
        {!viewOnly && (
            <div className="sidebar">
                <div className="sidebar-header"><h3>📅 일정 관리</h3></div>
                <form onSubmit={handleSave}>
                   <div className="control-box">
                      <span className="control-label">날짜 설정</span>
                      <div className="form-row"><label>시작일</label><input type="date" className="input-compact" value={inputDateStart} onChange={e => setInputDateStart(e.target.value)} required /></div>
                      {!isEditing && (<div className="form-row"><label>종료일</label><input type="date" className="input-compact" value={inputDateEnd} onChange={e => setInputDateEnd(e.target.value)} /></div>)}
                   </div>
                   <div className="control-box">
                      <span className="control-label">공정 내용</span>
                      <div className="form-row"><label>내용 입력</label><input type="text" className="input-compact" value={processesText} onChange={e => setProcessesText(e.target.value)} placeholder="예: 철거" required /></div>
                      <div className="check-group"><input type="checkbox" id="noisy" checked={isNoisy} onChange={e => setIsNoisy(e.target.checked)} /><label htmlFor="noisy">📢 소음 주의</label></div>
                   </div>
                   <div className="action-area">
                       <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isEditing ? '수정 완료' : '일정 등록'}</button>
                       {isEditing && (<div style={{display:'flex', gap:'10px', marginTop:'10px'}}><button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>취소</button><button type="button" className="btn btn-danger" onClick={handleDelete}>삭제</button></div>)}
                   </div>
                </form>
                
                <div style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
                   <div className="form-row">
                       <label>일정표 용지</label>
                       <select className="input-compact" style={{width:'130px'}} value={schedulePaperSize} onChange={e => setSchedulePaperSize(e.target.value as 'a4' | 'a3')}>
                          <option value="a4">A4 (5주/장)</option><option value="a3">A3 (6주/장)</option>
                       </select>
                   </div>
                   <button className="btn btn-print" onClick={handlePrintSchedule}>🖨️ 일정표 인쇄</button>
                </div>
                <div className="notice-section">
                   <div className="section-title">📢 공사 안내문</div>
                   <div className="form-row">
                       <label>안내문 용지</label>
                       <select className="input-compact" style={{width:'130px'}} value={noticePaperSize} onChange={e => setNoticePaperSize(e.target.value as 'a4' | 'a3')}>
                          <option value="a4">A4 (세로)</option><option value="a3">A3 (세로)</option>
                       </select>
                   </div>
                   <button className="btn btn-notice-print" onClick={handlePrintNotice}>안내문 출력</button>
                   <button className="btn btn-setting" onClick={() => setShowNoticeSettings(true)}>내용 설정</button>
                   <button className="btn btn-logo" onClick={() => logoInputRef.current?.click()}>{noticeSettings.logoUrl ? '로고 변경' : '로고 등록'}</button>
                   <input type="file" ref={logoInputRef} style={{display:'none'}} accept="image/*" onChange={handleLogoUpload} />
                </div>
            </div>
        )}

        {/* Screen View Dashboard */}
        <div className="screen-view">
            <div style={{marginBottom:'20px', borderBottom:'2px solid #333', paddingBottom:'10px', display:'flex', justifyContent:'space-between', alignItems:'end'}}>
                <h2 style={{margin:0, fontSize:'24px'}}>{currentSiteName} 전체 일정표</h2>
                <span style={{color:'#666', fontWeight:500}}>{dateRangeString}</span>
            </div>
            <table className="dashboard-table">
                <thead className="dashboard-header">
                    <tr><th className="sun">일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th className="sat">토</th></tr>
                </thead>
                <tbody>
                    {allWeeks.map((week, wIdx) => (
                        <tr key={wIdx} className="dashboard-row">
                            {week.map((day, dIdx) => (
                                <td key={dIdx}>
                                    <div style={{display:'flex', justifyContent:'space-between'}}>
                                        <span className={`td-date ${dIdx===0?'sun':dIdx===6?'sat':''}`}>{day.dayNum}</span>
                                        {day.schedules.some((s:any) => s.isNoisy) && <span className="noisy-badge">민원주의</span>}
                                    </div>
                                    {day.schedules.map((sched: any) => (
                                        <div key={sched.id} onClick={(e) => { e.stopPropagation(); handleEdit(sched); }} style={{cursor: viewOnly ? 'default' : 'pointer'}}>
                                            {sched.processes.map((proc: string, pIdx: number) => {
                                                const style = getProcessColor(proc);
                                                return (<div key={pIdx} className="proc-bar" style={{backgroundColor: style.bg, border:`1px solid ${style.border}`, color:style.text}}>{proc}</div>)
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

        {/* ... (Notice Settings & Print View 등 하단 코드 유지) ... */}
        {showNoticeSettings && (
            <div className="settings-overlay">
                <div className="settings-box">
                    {/* (설정 폼 내용 동일 - 생략) */}
                    <div className="settings-title">공사 안내문 내용 설정</div>
                    <label className="settings-label">회사명</label><input name="companyName" value={noticeSettings.companyName} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">공사 불편 신고</label><input name="complaintContact" value={noticeSettings.complaintContact} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">공사 책임자 연락처</label><input name="managerContact" value={noticeSettings.managerContact} onChange={handleNoticeSettingChange} className="settings-input" />
                    <div style={{display:'flex', gap:'10px', marginTop:'20px'}}><button className="btn btn-secondary" onClick={()=>setShowNoticeSettings(false)}>취소</button><button className="btn btn-primary" onClick={saveNoticeSettings}>저장</button></div>
                </div>
            </div>
        )}
        <div className="print-view-container">
            <div ref={schedulePrintRef}>
                {/* 일정표 출력 (기존 동일) */}
                {printPages.map((weeksChunk, pageIndex) => (
                    <div key={pageIndex} className={`paper-sheet ${schedulePaperSize}`}>
                        <div className="flex-table">
                            <div className="flex-thead">
                                <div style={{textAlign:'center', padding:'15px', borderBottom:'1px solid #000'}}>
                                    <span style={{fontSize:'24px', fontWeight:'900'}}>{currentSiteName} 공사 일정표</span>
                                    <span style={{fontSize:'14px', marginLeft:'10px', color:'#555'}}>{pageIndex === 0 ? `(${dateRangeString})` : `(Page ${pageIndex + 1})`}</span>
                                </div>
                                <div className="flex-tr-header">
                                    <div className="flex-th-day sun">일</div><div className="flex-th-day">월</div><div className="flex-th-day">화</div><div className="flex-th-day">수</div><div className="flex-th-day">목</div><div className="flex-th-day">금</div><div className="flex-th-day sat">토</div>
                                </div>
                            </div>
                            <div className="flex-tbody">
                                {weeksChunk.map((week, wIdx) => (
                                    <div key={wIdx} className="flex-tr">
                                        {week === null ? Array(7).fill(null).map((_, i) => <div key={i} className="flex-td"></div>) : week.map((day: any, dIdx: number) => {
                                            if(!day) return <div key={dIdx} className="flex-td"></div>;
                                            return (
                                                <div key={dIdx} className="flex-td">
                                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
                                                        <span className={`td-date ${dIdx===0?'sun':dIdx===6?'sat':''}`}>{day.dayNum}</span>
                                                        {day.schedules.some((s:any) => s.isNoisy) && <span className="noisy-badge">민원주의</span>}
                                                    </div>
                                                    {day.schedules.map((sched: any) => (
                                                        <div key={sched.id}>
                                                            {sched.processes.map((proc: string, pIdx: number) => {
                                                                const style = getProcessColor(proc);
                                                                return (<div key={pIdx} className="proc-bar" style={{backgroundColor: style.bg, border:`1px solid ${style.border}`, color:style.text}}>{proc}</div>);
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ))}
                            </div>
                            <OurProjectFooter />
                        </div>
                    </div>
                ))}
            </div>
            <div ref={noticePrintRef}>
                {/* 안내문 출력 (기존 동일) */}
                <div className={`notice-sheet ${noticePaperSize}`}>
                    <div className="notice-design-layout">
                        <div className="notice-top-bar"></div>
                        <div className="notice-header">
                            <h1 className="notice-title">NOTICE</h1>
                            {noticeSettings.logoUrl && <img src={noticeSettings.logoUrl} alt="Logo" className="notice-logo" />}
                        </div>
                        <div className="notice-body">
                            <div className="notice-intro">
                                안녕하세요. <strong>{noticeContent.company}</strong>입니다.<br/><span style={{fontWeight:'400'}}>입주민 여러분의 양해 부탁드립니다.</span>
                            </div>
                            <div className="notice-desc">
                                <strong>{noticeContent.locationText}</strong>의 내부 인테리어 공사를 진행하게 되었습니다.<br/>공사 기간 동안 소음 및 통행 불편을 최소화하기 위해 최선을 다하겠습니다.<br/>입주민 여러분의 너른 이해와 협조 부탁드립니다.
                            </div>
                            <div className="info-grid">
                                <div className="info-row-label">공 사 명</div><div className="info-row-value">{noticeContent.projectName}</div>
                                <div className="info-row-label">공사 기간</div><div className="info-row-value">{noticeContent.period}</div>
                                {noticeSettings.companyName && <><div className="info-row-label">시공 업체</div><div className="info-row-value">{noticeSettings.companyName}</div></>}
                                {noticeSettings.complaintContact && <><div className="info-row-label">불편 신고</div><div className="info-row-value" style={{fontWeight:'bold'}}>{noticeSettings.complaintContact}</div></>}
                                {noticeSettings.managerContact && <><div className="info-row-label">현장 책임자</div><div className="info-row-value">{noticeSettings.managerContact}</div></>}
                            </div>
                        </div>
                        <div className="notice-footer">
                            <p>입주민 여러분의 가정에 평안과 행복이 가득하시길 기원합니다.</p>
                            {(noticeSettings.blogUrl || noticeSettings.instaUrl || noticeSettings.youtubeUrl) && (
                                <div className="qr-wrapper">
                                    {noticeSettings.blogUrl && <div className="qr-card"><div className="qr-icon-circle"><Icons.NaverBlog /></div><QRCodeCanvas value={noticeSettings.blogUrl} size={90} /><span className="qr-label">BLOG</span></div>}
                                    {noticeSettings.instaUrl && <div className="qr-card"><div className="qr-icon-circle"><Icons.Instagram /></div><QRCodeCanvas value={noticeSettings.instaUrl} size={90} /><span className="qr-label">INSTAGRAM</span></div>}
                                    {noticeSettings.youtubeUrl && <div className="qr-card"><div className="qr-icon-circle"><Icons.Youtube /></div><QRCodeCanvas value={noticeSettings.youtubeUrl} size={90} /><span className="qr-label">YOUTUBE</span></div>}
                                </div>
                            )}
                        </div>
                        <OurProjectFooter />
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ConstructionScheduleModal;