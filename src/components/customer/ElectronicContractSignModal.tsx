import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { sendSystemMessage } from '../../utils/chatService';
import './ElectronicContractSignModal.css';

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Upload: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  Pen: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
  Trash: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
};

interface PaymentItem { id: string; label: string; checked: boolean; rate: number; amount: number; date: string; }
interface ContractData {
  siteName: string; address: string; clientName: string; clientPhone: string; clientAddress: string;
  partnerName: string; partnerOwner: string; partnerBizNum: string; partnerPhone: string; partnerAddress: string;
  startDate: string; endDate: string; supplyAmount: number; vatAmount: number; totalAmount: number; asPeriod: number;
  paymentTerms: { items: { [key: string]: PaymentItem } } | null;
  customContent: string; specialContent: string; partnerSealUrl?: string;
}
interface Props {
  siteId: string; partnerUid: string; data: ContractData; onClose: () => void; onSignedSuccess: () => void;
}

const numberToKorean = (number: number) => {
  const units = ['', '만', '억', '조'];
  const nums = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const strNum = String(number);
  let result = '';
  let unitIdx = 0;
  for (let i = strNum.length; i > 0; i -= 4) {
    const chunk = strNum.slice(Math.max(0, i - 4), i);
    let chunkKorean = '';
    for (let j = 0; j < chunk.length; j++) {
      const digit = parseInt(chunk[j]);
      if (digit > 0) {
        const pos = chunk.length - 1 - j;
        const posUnit = ['', '십', '백', '천'][pos];
        chunkKorean += nums[digit] + posUnit;
      }
    }
    if (chunkKorean) result = chunkKorean + units[unitIdx] + result;
    unitIdx++;
  }
  return result;
};

const ElectronicContractSignModal: React.FC<Props> = ({ siteId, partnerUid, data, onClose, onSignedSuccess }) => {
  const db = getFirestore();
  const storage = getStorage();
  
  const sigCanvas = useRef<SignatureCanvas>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [residentNum, setResidentNum] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Canvas Size State for Responsiveness
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 160 });

  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('sig-container');
      if (container) {
        setCanvasSize({ width: container.offsetWidth, height: 160 });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResidentNumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, ''); 
    let formatted = val;
    if (val.length > 6) formatted = `${val.slice(0, 6)}-${val.slice(6, 13)}`;
    if (val.length > 13) formatted = `${val.slice(0, 6)}-${val.slice(6, 13)}`; 
    setResidentNum(formatted);
  };

  const handleIdCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setIdCardFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setIdCardPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleClear = () => { sigCanvas.current?.clear(); };

  const getDaysDiff = () => {
    if (!data.startDate || !data.endDate) return '';
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays}일간`;
  };
  
  const renderPaymentRows = () => {
    if (!data.paymentTerms) return <tr><td colSpan={4} className="center">별도 협의</td></tr>;
    const items = Object.values(data.paymentTerms.items as any)
        .filter((i: any) => i.checked)
        .sort((a: any, b: any) => {
            if (!a.date) return 1; if (!b.date) return -1;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

    return items.map((item: any, idx: number) => (
        <React.Fragment key={idx}>
            <tr>
                <td className="center">{item.label}</td>
                <td className="center">{item.rate}%</td>
                <td className="right bold">{item.amount.toLocaleString()} 원</td>
                <td className="center">{item.date || '날짜 미정'}</td>
            </tr>
            {item.id === 'balance' && (
                <tr className="vat-row">
                    <td className="center label-sub">부가세</td>
                    <td className="center"></td>
                    <td className="right bold">{data.vatAmount.toLocaleString()} 원</td>
                    <td className="center">{item.date || '날짜 미정'}</td>
                </tr>
            )}
        </React.Fragment>
    ));
  };

  const processContent = (text: string) => {
    if (!text) return "";
    let processed = text
        .replace(/{{현장명}}/g, `<b>${data.siteName}</b>`)
        .replace(/{{주소}}/g, `<b>${data.address}</b>`)
        .replace(/{{착공일}}/g, `<b>${data.startDate}</b>`)
        .replace(/{{준공일}}/g, `<b>${data.endDate}</b>`)
        .replace(/{{공사일수}}/g, getDaysDiff())
        .replace(/{{총공사금액}}/g, `<span class="highlight-money">일금 ${numberToKorean(data.totalAmount)}원정 (₩ ${data.totalAmount.toLocaleString()})</span>`)
        .replace(/{{공급가액}}/g, data.supplyAmount.toLocaleString())
        .replace(/{{부가세}}/g, data.vatAmount.toLocaleString())
        .replace(/{{AS기간}}/g, `<b>${data.asPeriod}</b>`);
    return processed.split('\n').join('<br/>');
  };

  const handleSubmit = async () => {
    if (residentNum.length < 14) return alert("주민등록번호를 올바르게 입력해주세요.");
    if (!idCardFile) return alert("신분증 사본을 첨부해주세요.");
    if (sigCanvas.current?.isEmpty()) return alert("서명을 해주세요.");
    if (!confirm("계약을 체결하시겠습니까?\n체결 후에는 수정할 수 없습니다.")) return;

    setIsSubmitting(true);
    try {
        const signatureDataUrl = sigCanvas.current ? sigCanvas.current.getCanvas().toDataURL('image/png') : '';
        if (!signatureDataUrl) throw new Error("서명 데이터 오류");

        // 1. 신분증 업로드
        const idCardRef = ref(storage, `users/${partnerUid}/sites/${siteId}/contracts/id_card_${Date.now()}`);
        await uploadBytes(idCardRef, idCardFile);
        const idCardUrl = await getDownloadURL(idCardRef);

        // 2. PDF 생성
        let pdfUrl = '';
        if (contentRef.current) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const canvas = await html2canvas(contentRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            const pdfData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const w = 210, h = 297;
            const imgH = (canvas.height * w) / canvas.width;
            let heightLeft = imgH, pos = 0;
            pdf.addImage(pdfData, 'PNG', 0, pos, w, imgH);
            heightLeft -= h;
            while(heightLeft > 0) {
                pos = heightLeft - imgH;
                pdf.addPage();
                pdf.addImage(pdfData, 'PNG', 0, pos, w, imgH);
                heightLeft -= h;
            }
            const pdfBlob = pdf.output('blob');
            const pdfRef = ref(storage, `users/${partnerUid}/sites/${siteId}/contracts/contract_${Date.now()}.pdf`);
            await uploadBytes(pdfRef, pdfBlob);
            pdfUrl = await getDownloadURL(pdfRef);
        }

        // 3. DB 업데이트
        await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), {
            'contract.status': 'signed',
            'contract.signedAt': serverTimestamp(),
            'contract.clientRRN': residentNum,
            'contract.idCardUrl': idCardUrl,
            'contract.pdfUrl': pdfUrl, 
            'contract.signatureUrl': signatureDataUrl
        });

        await sendSystemMessage(siteId, "고객님이 전자계약서 작성을 완료 했습니다.");
        alert("전자계약 체결이 완료되었습니다.");
        onSignedSuccess();
        onClose();

    } catch (e: any) {
        console.error(e);
        alert(`오류가 발생했습니다: ${e.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="ecs-overlay">
      <div className="ecs-container">
        {/* Header */}
        <div className="ecs-header">
          <div className="ecs-title-group">
            <span className="ecs-badge">Contract</span>
            <h3>전자계약 체결</h3>
          </div>
          <button className="ecs-close-btn" onClick={onClose} aria-label="닫기"><Icons.Close /></button>
        </div>

        {/* Scrollable Content */}
        <div className="ecs-body">
          <div className="ecs-paper-wrapper">
            
            {/* 1. 계약서 뷰어 (A4 Style) */}
            <div className="ecs-paper" ref={contentRef}>
              <div className="doc-header">
                <h1 className="doc-title">실내건축 공사 표준계약서</h1>
                <p className="doc-subtitle">(표준약관 제10079호)</p>
              </div>

              <div className="doc-content">
                <div dangerouslySetInnerHTML={{ __html: processContent(data.customContent) }} />
              </div>

              {data.specialContent && (
                <div className="doc-special-terms">
                  <h4>[특약 사항]</h4>
                  <div dangerouslySetInnerHTML={{ __html: data.specialContent.replace(/\n/g, '<br/>') }} />
                </div>
              )}

              {/* 신분증 미리보기 (계약서 내부 렌더링용) */}
              {idCardPreview && (
                <div className="doc-attach-section">
                  <h4>[별첨] 도급인 신분증 사본</h4>
                  <img src={idCardPreview} alt="신분증" className="doc-attach-img" />
                </div>
              )}

              <div className="doc-footer-section">
                <p className="doc-legal-notice">
                  위와 같이 계약을 체결하고 이를 증명하기 위하여 본 계약서를 전자문서로 작성하여, 
                  '갑'과 '을'이 전자서명 후 730디자인그룹 서버에 보관한다.
                </p>
                <div className="doc-sign-date">{new Date().toLocaleDateString()} 작성</div>

                <div className="doc-signature-grid">
                  <div className="doc-sign-box">
                    <div className="role">도급인 (갑)</div>
                    <div className="row"><span className="lbl">주 소</span> {data.clientAddress}</div>
                    <div className="row"><span className="lbl">성 명</span> {data.clientName}</div>
                    <div className="row"><span className="lbl">주민번호</span> {residentNum || '____________'}</div>
                    {/* 캡처용 서명 위치 (실제로는 비워둠) */}
                    <div className="signature-placeholder">(전자서명 첨부)</div>
                  </div>
                  <div className="doc-sign-box">
                    <div className="role">수급인 (을)</div>
                    <div className="row"><span className="lbl">상 호</span> {data.partnerName}</div>
                    <div className="row"><span className="lbl">대 표</span> {data.partnerOwner}</div>
                    {data.partnerSealUrl && <img src={data.partnerSealUrl} className="partner-seal" crossOrigin="anonymous" alt="seal"/>}
                  </div>
                </div>
              </div>

              {/* 별첨: 대금 지급 조건 (페이지 넘김 고려) */}
              <div className="doc-page-break"></div>
              <div className="doc-appendix">
                <h4>[별첨] 공사대금 지급 조건</h4>
                <div className="doc-table-wrap">
                  <table>
                    <thead><tr><th>구분</th><th>비율</th><th>금액 (VAT 포함)</th><th>지급 예정일</th></tr></thead>
                    <tbody>{renderPaymentRows()}</tbody>
                    <tfoot>
                      <tr className="total">
                        <td>합계</td><td>100%</td>
                        <td className="right">{data.totalAmount.toLocaleString()} 원</td>
                        <td>-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* 2. 입력 및 서명 폼 (Action Zone) */}
            <div className="ecs-form-card">
              <div className="ecs-form-header">
                <Icons.Pen />
                <h4>필수 정보 입력 및 서명</h4>
              </div>
              
              <div className="ecs-input-group">
                <label>주민등록번호 <span className="req">*</span></label>
                <input 
                  type="text" 
                  placeholder="000000-0000000" 
                  value={residentNum} 
                  onChange={handleResidentNumChange} 
                  maxLength={14}
                  className="ecs-input"
                />
              </div>

              <div className="ecs-input-group">
                <label>신분증 사본 <span className="req">*</span></label>
                <div className={`ecs-file-dropzone ${idCardPreview ? 'has-file' : ''}`} onClick={() => fileInputRef.current?.click()}>
                  {idCardPreview ? (
                    <div className="file-preview-wrap">
                      <img src={idCardPreview} alt="Preview" />
                      <div className="file-change-overlay"><Icons.Upload /> 변경하기</div>
                    </div>
                  ) : (
                    <div className="file-placeholder">
                      <div className="icon-circle"><Icons.Upload /></div>
                      <p>터치하여 신분증 사진을 업로드하세요</p>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} accept="image/*" onChange={handleIdCardChange} hidden />
                </div>
              </div>

              <div className="ecs-input-group">
                <div className="sig-label-row">
                  <label>전자 서명 <span className="req">*</span></label>
                  <button className="btn-text-clear" onClick={handleClear}><Icons.Trash /> 지우기</button>
                </div>
                <div className="sig-container" id="sig-container">
                  <SignatureCanvas 
                    ref={sigCanvas}
                    penColor="black"
                    canvasProps={{ width: canvasSize.width, height: canvasSize.height, className: 'sig-canvas' }} 
                  />
                  <div className="sig-watermark">여기에 서명하세요</div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Sticky Footer */}
        <div className="ecs-footer">
          <button className="ecs-btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '처리 중...' : '서명 및 계약 체결 완료'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ElectronicContractSignModal;