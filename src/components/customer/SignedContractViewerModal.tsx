import React, { useRef, useState } from 'react';
import './SignedContractViewerModal.css';

// --- [Design System Icons] ---
const ContractIcons = {
  Close: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Print: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  Rewrite: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
};

interface PaymentItem {
  id: string; label: string; checked: boolean; rate: number; amount: number; date: string;
}

interface ContractData {
  siteName: string; address: string;
  clientName: string; clientPhone: string; clientAddress: string;
  partnerName: string; partnerOwner: string; partnerBizNum: string; partnerPhone: string; partnerAddress: string;
  startDate: string; endDate: string;
  supplyAmount: number; vatAmount: number; totalAmount: number; asPeriod: number;
  paymentTerms: { items: { [key: string]: PaymentItem } } | null;
  customContent: string; specialContent: string;
  signatureUrl?: string; clientRRN?: string; idCardUrl?: string; signedAt?: any; partnerSealUrl?: string;
}

interface Props {
  data: ContractData;
  onClose: () => void;
  onRequestRewrite?: () => void;
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

const SignedContractViewerModal: React.FC<Props> = ({ data, onClose, onRequestRewrite }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSavePdf = () => {
    if (!contentRef.current) return;
    const contentHtml = contentRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return alert("팝업 차단을 해제해 주세요.");

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>체결계약서_${data.clientName}</title>
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          body { font-family: 'Pretendard', serif; margin: 0; padding: 0; background-color: #fff; color: #111; }
          @page { size: A4 portrait; margin: 15mm; }
          
          /* 프린트 전용 스타일 (강제 A4 규격) */
          .doc-wrapper { padding: 0; width: 100%; max-width: 100%; }
          .doc-title { text-align: center; font-size: 24pt; font-weight: 900; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 20px; letter-spacing: -1px; }
          .doc-subtitle { text-align: center; font-size: 11pt; margin-bottom: 40px; color: #555; }
          .doc-section { margin-bottom: 30px; font-size: 11pt; line-height: 1.8; text-align: justify; word-break: keep-all; }
          .doc-section h4 { font-size: 14pt; font-weight: 800; border-left: 4px solid #000; padding-left: 10px; margin-bottom: 15px; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
          th, td { border: 1px solid #ccc; padding: 10px; }
          th { background-color: #f8f9fa !important; font-weight: 800; text-align: center; -webkit-print-color-adjust: exact; }
          td.right { text-align: right; }
          td.center { text-align: center; }
          
          .special-terms { border: 2px solid #333; padding: 20px; margin-top: 30px; border-radius: 8px; page-break-inside: avoid; }
          
          .doc-footer { margin-top: 60px; text-align: center; page-break-inside: avoid; }
          .date-today { margin: 40px 0; font-size: 14pt; font-weight: 800; letter-spacing: 2px; }
          
          .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; text-align: left; }
          .sign-box { border: 1px solid #ddd; padding: 20px; position: relative; page-break-inside: avoid; }
          .sign-role { font-weight: 900; font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .sign-row { margin-bottom: 8px; font-size: 11pt; display: flex; }
          .sign-row .label { font-weight: 700; width: 80px; color: #555; }
          
          .seal-box { position: absolute; right: 20px; bottom: 20px; width: 80px; height: 80px; mix-blend-mode: multiply; }
          .seal-box img { width: 100%; height: 100%; object-fit: contain; }
          
          .id-card-section { page-break-before: always; border-top: 2px dashed #ccc; padding-top: 30px; margin-top: 30px; text-align: center; }
          .id-card-img { max-width: 80%; height: auto; border: 1px solid #eee; margin-top: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="doc-wrapper">${contentHtml}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
  };

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
      .sort((a: any, b: any) => new Date(a.date || '9999-12-31').getTime() - new Date(b.date || '9999-12-31').getTime());

    return items.map((item: any, idx: number) => (
      <React.Fragment key={idx}>
        <tr>
          <td className="center">{item.label}</td>
          <td className="center">{item.rate}%</td>
          <td className="right bold">{item.amount.toLocaleString()} 원</td>
          <td className="center">{item.date || '날짜 미정'}</td>
        </tr>
        {item.id === 'balance' && (
          <tr style={{ backgroundColor: '#fdfdfd' }}>
            <td className="center bold" style={{color:'#666'}}>부가세</td>
            <td className="center">-</td>
            <td className="right bold" style={{color:'#333'}}>{data.vatAmount.toLocaleString()} 원</td>
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
      .replace(/{{총공사금액}}/g, `<span class="highlight-money">일금 ${numberToKorean(data.totalAmount)}원정 (₩${data.totalAmount.toLocaleString()})</span>`)
      .replace(/{{공급가액}}/g, data.supplyAmount.toLocaleString())
      .replace(/{{부가세}}/g, data.vatAmount.toLocaleString())
      .replace(/{{AS기간}}/g, `<b>${data.asPeriod}</b>`);
    return processed.split('\n').join('<br/>');
  };

  const getSignedDate = () => {
    if (data.signedAt && data.signedAt.toDate) return new Date(data.signedAt.toDate()).toLocaleDateString();
    return new Date().toLocaleDateString();
  };

  return (
    <div className="scv-overlay">
      <div className="scv-container">
        
        {/* Header */}
        <div className="scv-header">
          <div className="scv-header-title">
            <h3>계약서 확인</h3>
            <span className="scv-status-badge"><ContractIcons.Check />체결 완료</span>
          </div>
          <button className="scv-close-btn" onClick={onClose} aria-label="닫기">
            <ContractIcons.Close />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="scv-content-area">
          <div className="scv-paper" ref={contentRef}>
            
            {/* Title Section */}
            <div className="doc-section center">
              <h1 className="doc-title">실내건축 공사 표준계약서</h1>
              <div className="doc-subtitle">표준약관 제10079호 | 전자문서 번호 : {new Date().getTime()}</div>
            </div>

            {/* Main Content */}
            <div className="doc-section content">
              <div dangerouslySetInnerHTML={{ __html: processContent(data.customContent) }} />
            </div>

            {/* Special Terms */}
            {data.specialContent && (
              <div className="doc-section special-terms">
                <h4>[특약 사항]</h4>
                <div dangerouslySetInnerHTML={{ __html: data.specialContent.replace(/\n/g, '<br/>') }} />
              </div>
            )}

            {/* Payment Table */}
            <div className="doc-section">
                <h4>[별첨] 공사대금 지급 조건</h4>
                <div className="table-responsive">
                    <table>
                        <thead><tr><th>구분</th><th>비율</th><th>금액 (VAT 포함)</th><th>지급 예정일</th></tr></thead>
                        <tbody>{renderPaymentRows()}</tbody>
                        <tfoot>
                            <tr style={{backgroundColor:'#f1f3f5', fontWeight:'bold'}}>
                                <td className="center">총 합계</td>
                                <td className="center">100%</td>
                                <td className="right" style={{color:'#d6336c'}}>{data.totalAmount.toLocaleString()} 원</td>
                                <td className="center">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p className="payment-note">※ 입금 계좌 : {data.partnerName} 지정 계좌로 송금 바랍니다.</p>
            </div>

            {/* Signatures */}
            <div className="doc-footer">
              <p>본 계약의 성립을 증명하기 위해 전자서명을 진행하였으며,<br/>아워프로젝트 서버에 원본이 보관됩니다.</p>
              <div className="date-today">{getSignedDate()} 체결완료</div>

              <div className="sign-grid">
                {/* Client */}
                <div className="sign-box">
                  <div className="sign-role">도급인 (소비자)</div>
                  <div className="sign-row"><span className="label">주 소</span> {data.clientAddress}</div>
                  <div className="sign-row"><span className="label">연 락 처</span> {data.clientPhone}</div>
                  <div className="sign-row"><span className="label">성 명</span> {data.clientName}</div>
                  <div className="seal-box">
                    {data.signatureUrl ? <img src={data.signatureUrl} alt="서명" crossOrigin="anonymous"/> : <span className="no-sig">(서명없음)</span>}
                  </div>
                </div>

                {/* Partner */}
                <div className="sign-box">
                  <div className="sign-role">수급인 (시공사)</div>
                  <div className="sign-row"><span className="label">상 호</span> {data.partnerName}</div>
                  <div className="sign-row"><span className="label">주 소</span> {data.partnerAddress}</div>
                  <div className="sign-row"><span className="label">등 록 번 호</span> {data.partnerBizNum}</div>
                  <div className="sign-row"><span className="label">대 표 자</span> {data.partnerOwner}</div>
                  <div className="seal-box">
                    {data.partnerSealUrl && <img src={data.partnerSealUrl} alt="직인" crossOrigin="anonymous"/>}
                  </div>
                </div>
              </div>
            </div>

            {/* ID Card Attachment */}
            {data.idCardUrl && (
              <div className="id-card-section">
                <h4>[별첨] 도급인 신분증 사본</h4>
                <img src={data.idCardUrl} alt="신분증" className="id-card-img" crossOrigin="anonymous" />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="scv-footer">
          {onRequestRewrite && (
            <button className="scv-btn secondary" onClick={onRequestRewrite}>
              <ContractIcons.Rewrite /> 계약서 수정 요청
            </button>
          )}
          <button className="scv-btn primary" onClick={handleSavePdf}>
            <ContractIcons.Print /> PDF 저장 / 인쇄
          </button>
        </div>

      </div>
    </div>
  );
};

export default SignedContractViewerModal;