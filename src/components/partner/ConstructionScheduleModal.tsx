import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc, setDoc 
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config';
import { useReactToPrint } from 'react-to-print';
import { QRCodeCanvas } from 'qrcode.react';
import logoSrc from '../../assets/logo.png'; 

// --- [ 아이콘 SVG 컴포넌트 ] ---
const Icons = {
  NaverBlog: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 3H21V21H3V3Z" fill="#03C75A"/>
      <path d="M7.5 7.5H10.5L13.5 11.8V7.5H16.5V16.5H13.5L10.5 12.2V16.5H7.5V7.5Z" fill="white"/>
    </svg>
  ),
  Instagram: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 2C4.462 2 2 4.462 2 7.5V16.5C2 19.538 4.462 22 7.5 22H16.5C19.538 22 22 19.538 22 16.5V7.5C22 4.462 19.538 2 16.5 2H7.5ZM16.5 3.833C18.525 3.833 20.167 5.475 20.167 7.5V16.5C20.167 18.525 18.525 20.167 16.5 20.167H7.5C5.475 20.167 3.833 18.525 3.833 16.5V7.5C3.833 5.475 5.475 3.833 7.5 3.833H16.5ZM12 7.042C9.261 7.042 7.042 9.261 7.042 12C7.042 14.739 9.261 16.958 12 16.958C14.739 16.958 16.958 14.739 16.958 12C16.958 9.261 14.739 7.042 12 7.042ZM17.208 5.875C17.208 6.381 16.798 6.792 16.292 6.792C15.786 6.792 15.375 6.381 15.375 5.875C15.375 5.369 15.786 4.958 16.292 4.958C16.798 4.958 17.208 5.369 17.208 5.875Z" fill="black"/>
    </svg>
  ),
  Youtube: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.582 5.093C21.328 4.143 20.584 3.398 19.634 3.144C17.915 2.684 12 2.684 12 2.684C12 2.684 6.085 2.684 4.366 3.144C3.416 3.398 2.671 4.143 2.417 5.093C1.957 6.812 1.957 10.4 1.957 10.4C1.957 10.4 1.957 13.989 2.417 15.707C2.671 16.657 3.416 17.402 4.366 17.656C6.085 18.116 12 18.116 12 18.116C12 18.116 17.915 18.116 19.634 17.656C20.584 17.402 21.328 16.657 21.582 15.707C22.042 13.989 22.042 10.4 22.042 10.4C22.042 10.4 22.042 6.812 21.582 5.093ZM9.645 13.78V7.02L15.576 10.4L9.645 13.78Z" fill="#FF0000"/>
    </svg>
  )
};

// --- [ 아워프로젝트 브랜딩 푸터 컴포넌트 ] ---
const OurProjectFooter = () => (
  <div className="ourproject-footer">
    <img src={logoSrc} alt="OurProject" className="footer-logo-img" />
    <div className="footer-slogan">
      소비자의 안전한 인테리어 마무리를 위한 공사 진행 서포트 플랫폼, <strong>아워프로젝트</strong>
    </div>
  </div>
);

// --- [ 타입 정의 ] ---
interface ScheduleEntry {
  id: string;
  date: string; 
  processes: string[];
  isNoisy: boolean;
  createdAt: Timestamp;
  siteName: string; 
}

interface NoticeSettings {
  companyName: string;
  complaintContact: string;
  managerContact: string;
  blogUrl: string;
  instaUrl: string;
  youtubeUrl: string;
  logoUrl: string;
}

interface ContractInfo {
  siteType: 'apartment' | 'residential' | 'commercial';
  address: string;
  aptName?: string;
  aptDong?: string;
  aptHo?: string;
  startDate?: string;
  endDate?: string;
}

interface ModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

// 헬퍼 함수들
const parseProcesses = (text: string): string[] => {
  return text.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 5);
};

const getProcessColor = (str: string) => {
  const palettes = [
    { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' }, 
    { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' }, 
    { bg: '#fff3e0', border: '#ffcc80', text: '#ef6c00' }, 
    { bg: '#f3e5f5', border: '#ce93d8', text: '#7b1fa2' }, 
    { bg: '#e0f7fa', border: '#80deea', text: '#006064' }, 
    { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' }, 
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palettes[Math.abs(hash % palettes.length)];
};

const ConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const storage = getStorage();

  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [currentSiteName, setCurrentSiteName] = useState('현장');
  
  // [중요] 시작일/종료일 상태
  const [siteStartDate, setSiteStartDate] = useState<string>(''); 
  const [siteEndDate, setSiteEndDate] = useState<string>(''); 
  
  // 계약 정보 상태
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);

  // 폼 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [inputDateStart, setInputDateStart] = useState(''); 
  const [inputDateEnd, setInputDateEnd] = useState('');
  const [processesText, setProcessesText] = useState('');
  const [isNoisy, setIsNoisy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 공사 안내문 상태
  const [showNoticeSettings, setShowNoticeSettings] = useState(false);
  const [noticeSettings, setNoticeSettings] = useState<NoticeSettings>({
    companyName: '', complaintContact: '', managerContact: '',
    blogUrl: '', instaUrl: '', youtubeUrl: '', logoUrl: ''
  });
  const logoInputRef = useRef<HTMLInputElement>(null);

  // 인쇄 Refs
  const schedulePrintRef = useRef<HTMLDivElement>(null);
  const noticePrintRef = useRef<HTMLDivElement>(null);
  
  // 용지 크기 상태
  const [schedulePaperSize, setSchedulePaperSize] = useState<'a4' | 'a3'>('a4');
  const [noticePaperSize, setNoticePaperSize] = useState<'a4' | 'a3'>('a4');

  // 데이터 로드
  useEffect(() => {
    if (!siteId || !partnerUid) return;
    const fetchData = async () => {
      try {
        const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        if (siteDoc.exists()) {
            const data = siteDoc.data();
            setCurrentSiteName(data.siteName || '현장');
            
            // [⭐ 수정됨] 날짜 로드 우선순위: 계약정보 > 현장정보 > 오늘
            let sDate = data.startDate || new Date().toISOString().split('T')[0];
            let eDate = data.endDate || '';

            // 계약 정보 불러오기 및 날짜 덮어쓰기
            if (data.contract) {
                const cInfo = data.contract as ContractInfo;
                setContractInfo(cInfo);
                
                // 계약 정보에 날짜가 있다면 그것을 우선 사용
                if (cInfo.startDate) sDate = cInfo.startDate;
                if (cInfo.endDate) eDate = cInfo.endDate;
            }

            setSiteStartDate(sDate);
            setSiteEndDate(eDate);
            
            // 입력폼 초기값도 동기화
            setInputDateStart(sDate);
            setInputDateEnd(eDate);
        }
        
        const noticeDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'));
        if (noticeDoc.exists()) {
            setNoticeSettings(noticeDoc.data() as NoticeSettings);
        }
      } catch (e) { console.error(e); }

      const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), orderBy('date', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: ScheduleEntry[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          list.push({ id: doc.id, ...data } as ScheduleEntry);
        });
        setSchedules(list);
      });
      return () => unsubscribe();
    };
    fetchData();
  }, [siteId, partnerUid, db]);

  // --- [ 핸들러 ] ---
  const handleEdit = (schedule: ScheduleEntry) => {
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
  
  // [수정] 취소 시 날짜는 다시 전체 기간으로 초기화
  const handleCancelEdit = () => {
    setIsEditing(false); setEditId(null); setProcessesText(''); setIsNoisy(false); 
    setInputDateEnd(siteEndDate); setInputDateStart(siteStartDate);
  };
  
  const handleNoticeSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNoticeSettings(prev => ({ ...prev, [name]: value }));
  };
  const saveNoticeSettings = async () => {
    try {
      await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), noticeSettings, { merge: true });
      alert("설정 저장 완료");
      setShowNoticeSettings(false);
    } catch (e) { console.error(e); alert("저장 실패"); }
  };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const fileRef = storageRef(storage, `sites/${siteId}/notice_logo_${Date.now()}`);
    try {
        const result = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(result.ref);
        setNoticeSettings(prev => ({ ...prev, logoUrl: url }));
        await setDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'config', 'notice'), { logoUrl: url }, { merge: true });
        alert("로고 등록 완료");
    } catch (err) { console.error(err); alert("업로드 실패"); }
  };

  // --- [ 인쇄 기능 ] ---
  const handlePrintSchedule = useReactToPrint({
    contentRef: schedulePrintRef,
    documentTitle: `${currentSiteName}_공사일정표`,
    pageStyle: `
      @page { size: landscape; margin: 0; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    `
  });

  const handlePrintNotice = useReactToPrint({
    contentRef: noticePrintRef,
    documentTitle: `${currentSiteName}_공사안내문`,
    pageStyle: `
      @page { size: portrait; margin: 0; } 
      @media print { 
        body { -webkit-print-color-adjust: exact; } 
        html, body { height: 100vh; }
      }
    `
  });

  // --- [ 달력 데이터 생성 로직 (수정됨) ] ---
  // 이제 siteStartDate ~ siteEndDate (계약 정보 기준)로 전체 기간을 잡습니다.
  const generateCalendarData = () => {
      // 시작일이 없으면 오늘 기준
      const baseStart = siteStartDate ? new Date(siteStartDate) : new Date();
      // 일요일 시작 보정
      const calendarStart = new Date(baseStart);
      calendarStart.setDate(baseStart.getDate() - baseStart.getDay());

      // 종료일 설정 (없으면 시작일 + 35일)
      let calendarEnd = siteEndDate ? new Date(siteEndDate) : new Date(baseStart);
      if (!siteEndDate) calendarEnd.setDate(calendarEnd.getDate() + 35);
      
      // 토요일 종료 보정
      const endDay = calendarEnd.getDay();
      calendarEnd.setDate(calendarEnd.getDate() + (6 - endDay));

      const weeks = [];
      let current = new Date(calendarStart);
      
      // 기간 동안 주 단위 생성
      while (current <= calendarEnd) {
          const week = [];
          for (let i = 0; i < 7; i++) {
              const dateStr = current.toISOString().split('T')[0];
              const schedule = schedules.find(s => s.date === dateStr);
              week.push({ dateStr, dayNum: current.getDate(), schedule });
              current.setDate(current.getDate() + 1);
          }
          weeks.push(week);
      }
      return weeks;
  };

  const allWeeks = generateCalendarData();
  
  // [수정됨] 헤더용 날짜 범위 텍스트 (계약 기간 기준)
  const dateRangeString = (siteStartDate && siteEndDate) 
    ? `${siteStartDate} ~ ${siteEndDate}` 
    : (allWeeks.length > 0 ? `${allWeeks[0][0].dateStr} ~ ${allWeeks[allWeeks.length-1][6].dateStr}` : '');

  // 페이지네이션
  const rowsPerPage = schedulePaperSize === 'a4' ? 5 : 6;
  const printPages: (typeof allWeeks[0] | null)[][] = [];
  for (let i = 0; i < allWeeks.length; i += rowsPerPage) {
      const chunk: (typeof allWeeks[0] | null)[] = allWeeks.slice(i, i + rowsPerPage);
      while (chunk.length < rowsPerPage) { chunk.push(null); }
      printPages.push(chunk);
  }

  // --- [ 안내문 동적 텍스트 ] ---
  const getNoticeContent = () => {
    // 1. 공사 기간 (상태값 사용)
    const period = (siteStartDate && siteEndDate) ? `${siteStartDate} ~ ${siteEndDate}` : '미정';

    // 2. 장소 설명 & 공사명
    let locationText = `[${currentSiteName}]`; 
    let projectName = `${currentSiteName} 인테리어 공사`;

    if (contractInfo) {
        if (contractInfo.siteType === 'apartment') {
            const apt = contractInfo.aptName || '';
            const dong = contractInfo.aptDong ? `${contractInfo.aptDong}동` : '';
            const ho = contractInfo.aptHo ? `${contractInfo.aptHo}호` : '';
            
            // 본문: 동 호수 우선
            locationText = `${dong} ${ho}`.trim();
            if (!locationText) locationText = apt;

            // 제목: 아파트명 + 동 + 호수
            const fullAptName = `${apt} ${dong} ${ho}`.trim();
            if (fullAptName) {
                projectName = `${fullAptName} 인테리어 공사`;
            }
        } else {
            locationText = contractInfo.address || locationText;
        }
    }

    const company = noticeSettings.companyName || '[시공사]';
    return { period, locationText, company, projectName };
  };

  const noticeContent = getNoticeContent();

  return (
    <div className="schedule-overlay">
      <style>{`
        /* Reset */
        .schedule-overlay * { box-sizing: border-box; }
        .schedule-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.6); z-index: 9999;
          display: flex; justify-content: center; align-items: center;
          backdrop-filter: blur(4px);
        }
        .schedule-modal {
          position: relative; width: 98%; max-width: 1800px; height: 95vh;
          background: #fff; border-radius: 12px; display: flex; overflow: hidden;
          box-shadow: 0 15px 40px rgba(0,0,0,0.25);
        }

        /* Sidebar ... (기존과 동일) */
        .sidebar { width: 360px; background: #fff; border-right: 1px solid #e0e0e0; padding: 25px; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; }
        .sidebar-header { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0; }
        .sidebar-header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #333; }
        .control-box { background: #f8f9fa; border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .control-label { display: block; font-size: 13px; font-weight: 700; color: #555; margin-bottom: 15px; border-left: 3px solid #4a90e2; padding-left: 8px; }
        .form-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; width: 100%; white-space: nowrap; }
        .form-row label { font-size: 13px; font-weight: 600; color: #444; margin-right: 10px; flex-shrink: 0; }
        .input-compact { width: 140px; padding: 8px; border: 1px solid #ddd; border-radius: 5px; font-size: 13px; text-align: right; background: #fff; }
        .action-area { margin-top: auto; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 5px; font-weight: 600; font-size: 14px; cursor: pointer; transition: 0.2s; margin-top: 5px; }
        .btn-primary { background: #4a90e2; color: #fff; }
        .btn-secondary { background: #fff; color: #555; border: 1px solid #ddd; }
        .btn-danger { background: #fff; color: #e74c3c; border: 1px solid #e74c3c; }
        .btn-print { background: #333; color: white; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
        .notice-section { margin-top: 30px; border-top: 2px solid #f0f0f0; padding-top: 20px; }
        .section-title { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 15px; }
        .btn-notice-print { background: #e67e22; color: white; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
        .btn-setting { background: #fff; border: 1px solid #ccc; color: #555; margin-top: 8px; }
        .btn-logo { background: #fff; border: 1px dashed #ccc; color: #777; font-weight: normal; font-size: 13px; margin-top: 5px; }

        /* Dashboard */
        .screen-view { flex: 1; background: #fff; padding: 30px; overflow: auto; display: flex; flex-direction: column; }
        .dashboard-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #ddd; }
        .dashboard-header th { position: sticky; top: 0; background: #f1f3f5; border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: 700; color: #444; z-index: 10; }
        .dashboard-header th.sun { color: #e74c3c; background: #fff5f5; }
        .dashboard-header th.sat { color: #1976d2; background: #f0f7ff; }
        .dashboard-row td { border: 1px solid #eee; vertical-align: top; padding: 8px; height: 140px; transition: background 0.1s; }
        .dashboard-row td:hover { background-color: #fafafa; }

        .print-view-container { display: none; }

        /* Elements */
        .td-date { font-weight: 800; font-size: 14px; display: block; margin-bottom: 6px; color: #333; }
        .sun .td-date { color: #d32f2f; }
        .sat .td-date { color: #1976d2; }
        .proc-bar { padding: 3px 6px; margin-bottom: 3px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .noisy-badge { position: absolute; top: 8px; right: 8px; background: #d32f2f; color: #fff; font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 12px; }
        .btn-close-modal { position: absolute; top: 20px; right: 25px; background: none; border: none; font-size: 32px; color: #888; cursor: pointer; z-index: 1000; }

        /* Footer Styles */
        .ourproject-footer {
            margin-top: auto; padding-top: 15px; border-top: 1px solid #eee; text-align: center; width: 100%; flex-shrink: 0;
            display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .footer-logo-img { height: 30px; width: auto; object-fit: contain; }
        .footer-slogan { font-size: 11px; color: #888; font-weight: 500; }

        /* Settings Modal */
        .settings-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.95); z-index: 2000; display: flex; justify-content: center; align-items: center; }
        .settings-box { background: #fff; border: 1px solid #ccc; box-shadow: 0 10px 30px rgba(0,0,0,0.2); width: 420px; padding: 30px; border-radius: 8px; }
        .settings-title { font-size: 20px; font-weight: 800; margin-bottom: 25px; text-align: center; border-bottom: 2px solid #eee; padding-bottom: 15px; }
        .settings-label { font-size: 13px; font-weight: 700; display: block; margin-bottom: 6px; color: #444; }
        .settings-input { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }

        /* Notice Print Styles */
        .notice-sheet {
            background: white; margin: 0 auto; box-sizing: border-box;
            display: flex; flex-direction: column; position: relative;
            font-family: 'Pretendard', 'Noto Sans KR', sans-serif;
        }
        .notice-sheet.a4 { width: 210mm; height: 297mm; padding: 15mm; }
        .notice-sheet.a3 { width: 297mm; height: 420mm; padding: 25mm; }

        .notice-design-layout { height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
        .notice-top-bar { width: 100%; height: 8px; background: #222; margin-bottom: 2%; flex-shrink: 0; }
        .notice-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; padding-bottom: 20px; margin-bottom: 30px; flex-shrink: 0; }
        .notice-title { font-size: 40px; font-weight: 800; color: #111; letter-spacing: -1px; margin: 0; }
        .notice-logo { max-height: 50px; max-width: 150px; object-fit: contain; }
        
        .notice-body { flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .notice-intro { font-size: 22px; font-weight: 700; color: #222; margin-bottom: 20px; line-height: 1.3; }
        .notice-desc { font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 40px; }

        .info-grid { display: grid; grid-template-columns: 110px 1fr; border-top: 2px solid #222; margin-bottom: 30px; }
        .info-row-label { padding: 12px 0; font-weight: 700; color: #222; font-size: 15px; border-bottom: 1px solid #eee; }
        .info-row-value { padding: 12px 0 12px 20px; color: #444; font-size: 15px; border-bottom: 1px solid #eee; }

        .notice-footer { text-align: center; flex-shrink: 0; margin-top: 20px; }
        .notice-footer p { font-size: 15px; color: #777; margin-bottom: 30px; font-weight: 600; }

        .qr-wrapper { display: flex; justify-content: center; gap: 40px; padding-top: 25px; border-top: 1px solid #eee; margin-bottom: 30px; }
        .qr-card { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .qr-icon-circle { width: 36px; height: 36px; border-radius: 50%; display: flex; justify-content: center; align-items: center; margin-bottom: 2px; }
        .qr-label { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }

        @media print {
          body, html { margin: 0; padding: 0; height: 100%; }
          .schedule-overlay { position: static; display: block; background: none; }
          .schedule-modal { width: 100%; height: auto; box-shadow: none; border-radius: 0; display: block; overflow: visible; max-width: none; }
          .sidebar, .btn-close-modal, .screen-view, .settings-overlay { display: none !important; }
          .print-view-container { display: block !important; }
          
          /* Schedule Print */
          .paper-sheet {
             width: 100%; height: 100vh; max-width: none; margin: 0; padding: 10mm; 
             box-shadow: none; break-after: page; display: flex; flex-direction: column;
          }
          .print-table { width: 100%; height: 100%; border: 2px solid #000; display: flex; flex-direction: column; justify-content: space-between; }
          .print-thead { flex: 0 0 auto; border-bottom: 2px solid #000; }
          .print-tbody { flex: 1; display: flex; flex-direction: column; }
          .print-tr { flex: 1; display: flex; border-bottom: 1px solid #ccc; }
          .print-td { flex: 1; border-right: 1px solid #ccc; padding: 5px; }

          /* Notice Print */
          .notice-sheet { width: 100% !important; height: 100vh !important; padding: 0 !important; margin: 0 !important; border: none !important; break-after: page; }
          .notice-design-layout { height: 100%; padding: 15mm; box-sizing: border-box; }
        }
      `}</style>

      {/* ... [상단 JSX] ... */}
      
      <div className="schedule-modal">
        <button className="btn-close-modal" onClick={onClose}>&times;</button>
        <div className="sidebar">
            {/* ... (Sidebar 내용 유지) ... */}
            <div className="sidebar-header"><h3>📅 일정 관리</h3></div>
            <form onSubmit={handleSave}>
               {/* ... (Input Fields) ... */}
               <div className="control-box">
                  <span className="control-label">날짜 설정</span>
                  <div className="form-row">
                      <label>시작일</label>
                      <input type="date" className="input-compact" value={inputDateStart} onChange={e => setInputDateStart(e.target.value)} required />
                  </div>
                  {!isEditing && (
                      <div className="form-row">
                          <label>종료일</label>
                          <input type="date" className="input-compact" value={inputDateEnd} onChange={e => setInputDateEnd(e.target.value)} />
                      </div>
                  )}
               </div>
               <div className="control-box">
                  <span className="control-label">공정 내용</span>
                  <div className="form-row">
                      <label>내용 입력</label>
                      <input type="text" className="input-compact" value={processesText} onChange={e => setProcessesText(e.target.value)} placeholder="예: 철거" required />
                  </div>
                  <div className="check-group">
                      <input type="checkbox" id="noisy" checked={isNoisy} onChange={e => setIsNoisy(e.target.checked)} />
                      <label htmlFor="noisy">📢 소음 주의</label>
                  </div>
               </div>
               <div className="action-area">
                   <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isEditing ? '수정 완료' : '일정 등록'}</button>
                   {isEditing && <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>취소</button>}
               </div>
            </form>
            
            <div style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px'}}>
               <div className="form-row">
                   <label>일정표 용지</label>
                   <select className="input-compact" style={{width:'130px'}} value={schedulePaperSize} onChange={e => setSchedulePaperSize(e.target.value as 'a4' | 'a3')}>
                      <option value="a4">A4 (5주/장)</option>
                      <option value="a3">A3 (6주/장)</option>
                   </select>
               </div>
               <button className="btn btn-print" onClick={handlePrintSchedule}>🖨️ 일정표 인쇄</button>
            </div>

            <div className="notice-section">
               <div className="section-title">📢 공사 안내문</div>
               <div className="form-row">
                   <label>안내문 용지</label>
                   <select className="input-compact" style={{width:'130px'}} value={noticePaperSize} onChange={e => setNoticePaperSize(e.target.value as 'a4' | 'a3')}>
                      <option value="a4">A4 (세로)</option>
                      <option value="a3">A3 (세로)</option>
                   </select>
               </div>
               <button className="btn btn-notice-print" onClick={handlePrintNotice}>안내문 출력</button>
               <button className="btn btn-setting" onClick={() => setShowNoticeSettings(true)}>내용 설정</button>
               <button className="btn btn-logo" onClick={() => logoInputRef.current?.click()}>
                  {noticeSettings.logoUrl ? '로고 변경' : '로고 등록'}
               </button>
               <input type="file" ref={logoInputRef} style={{display:'none'}} accept="image/*" onChange={handleLogoUpload} />
            </div>
        </div>

        {/* ... (Screen View Dashboard 동일) ... */}
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
                                <td key={dIdx} onClick={() => day.schedule && handleEdit(day.schedule)} style={{cursor: day.schedule ? 'pointer' : 'default'}}>
                                    <div style={{display:'flex', justifyContent:'space-between'}}>
                                        <span className={`td-date ${dIdx===0?'sun':dIdx===6?'sat':''}`}>{day.dayNum}</span>
                                        {day.schedule?.isNoisy && <span style={{fontSize:'12px'}}>📢</span>}
                                    </div>
                                    {day.schedule?.processes.map((proc, pIdx) => {
                                        const style = getProcessColor(proc);
                                        return (<div key={pIdx} className="proc-bar" style={{backgroundColor: style.bg, border:`1px solid ${style.border}`, color:style.text}}>{proc}</div>)
                                    })}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* ... (Settings Modal 동일) ... */}
        {showNoticeSettings && (
            <div className="settings-overlay">
                <div className="settings-box">
                    <div className="settings-title">공사 안내문 내용 설정</div>
                    <label className="settings-label">회사명</label>
                    <input name="companyName" value={noticeSettings.companyName} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">공사 불편 신고</label>
                    <input name="complaintContact" value={noticeSettings.complaintContact} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">공사 책임자 연락처</label>
                    <input name="managerContact" value={noticeSettings.managerContact} onChange={handleNoticeSettingChange} className="settings-input" />
                    <hr style={{margin:'15px 0', border:'none', borderTop:'1px dashed #ddd'}} />
                    <label className="settings-label">네이버 블로그 (URL)</label>
                    <input name="blogUrl" value={noticeSettings.blogUrl} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">인스타그램 (URL)</label>
                    <input name="instaUrl" value={noticeSettings.instaUrl} onChange={handleNoticeSettingChange} className="settings-input" />
                    <label className="settings-label">유튜브 (URL)</label>
                    <input name="youtubeUrl" value={noticeSettings.youtubeUrl} onChange={handleNoticeSettingChange} className="settings-input" />
                    <div style={{display:'flex', gap:'10px', marginTop:'20px'}}>
                        <button className="btn btn-secondary" onClick={()=>setShowNoticeSettings(false)}>취소</button>
                        <button className="btn btn-primary" onClick={saveNoticeSettings}>저장</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- Print View --- */}
        <div className="print-view-container">
            {/* 1. Schedule Print */}
            <div ref={schedulePrintRef}>
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
                                                    <span className={`td-date ${dIdx===0?'sun':dIdx===6?'sat':''}`}>{day.dayNum}</span>
                                                    {day.schedule?.isNoisy && <span className="noisy-badge">민원주의</span>}
                                                    {day.schedule?.processes.map((proc: string, pIdx: number) => {
                                                        const style = getProcessColor(proc);
                                                        return (<div key={pIdx} className="proc-bar" style={{backgroundColor: style.bg, border:`1px solid ${style.border}`, color:style.text}}>{proc}</div>);
                                                    })}
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

            {/* 2. Notice Print (동적 텍스트 적용) */}
            <div ref={noticePrintRef}>
                <div className={`notice-sheet ${noticePaperSize}`}>
                    <div className="notice-design-layout">
                        <div className="notice-top-bar"></div>
                        
                        <div className="notice-header">
                            <h1 className="notice-title">NOTICE</h1>
                            {noticeSettings.logoUrl && <img src={noticeSettings.logoUrl} alt="Logo" className="notice-logo" />}
                        </div>

                        <div className="notice-body">
                            <div className="notice-intro">
                                안녕하세요. <strong>{noticeContent.company}</strong>입니다.<br/>
                                <span style={{fontWeight:'400'}}>입주민 여러분의 양해 부탁드립니다.</span>
                            </div>
                            <div className="notice-desc">
                                <strong>{noticeContent.locationText}</strong>의 내부 인테리어 공사를 진행하게 되었습니다.<br/>
                                공사 기간 동안 소음 및 통행 불편을 최소화하기 위해 최선을 다하겠습니다.<br/>
                                입주민 여러분의 너른 이해와 협조 부탁드립니다.
                            </div>

                            <div className="info-grid">
                                <div className="info-row-label">공 사 명</div>
                                {/* [수정됨] 공사명에 동적 projectName 사용 */}
                                <div className="info-row-value">{noticeContent.projectName}</div>
                                
                                <div className="info-row-label">공사 기간</div>
                                <div className="info-row-value">{noticeContent.period}</div>
                                
                                {noticeSettings.companyName && <>
                                    <div className="info-row-label">시공 업체</div>
                                    <div className="info-row-value">{noticeSettings.companyName}</div>
                                </>}
                                {noticeSettings.complaintContact && <>
                                    <div className="info-row-label">불편 신고</div>
                                    <div className="info-row-value" style={{fontWeight:'bold'}}>{noticeSettings.complaintContact}</div>
                                </>}
                                {noticeSettings.managerContact && <>
                                    <div className="info-row-label">현장 책임자</div>
                                    <div className="info-row-value">{noticeSettings.managerContact}</div>
                                </>}
                            </div>
                        </div>

                        <div className="notice-footer">
                            <p>입주민 여러분의 가정에 평안과 행복이 가득하시길 기원합니다.</p>
                            
                            {(noticeSettings.blogUrl || noticeSettings.instaUrl || noticeSettings.youtubeUrl) && (
                                <div className="qr-wrapper">
                                    {noticeSettings.blogUrl && (
                                        <div className="qr-card">
                                            <div className="qr-icon-circle"><Icons.NaverBlog /></div>
                                            <QRCodeCanvas value={noticeSettings.blogUrl} size={90} />
                                            <span className="qr-label">BLOG</span>
                                        </div>
                                    )}
                                    {noticeSettings.instaUrl && (
                                        <div className="qr-card">
                                            <div className="qr-icon-circle"><Icons.Instagram /></div>
                                            <QRCodeCanvas value={noticeSettings.instaUrl} size={90} />
                                            <span className="qr-label">INSTAGRAM</span>
                                        </div>
                                    )}
                                    {noticeSettings.youtubeUrl && (
                                        <div className="qr-card">
                                            <div className="qr-icon-circle"><Icons.Youtube /></div>
                                            <QRCodeCanvas value={noticeSettings.youtubeUrl} size={90} />
                                            <span className="qr-label">YOUTUBE</span>
                                        </div>
                                    )}
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