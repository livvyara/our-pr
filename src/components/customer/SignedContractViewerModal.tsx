import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './SignedContractViewerModal.css';

interface PaymentItem {
    id: string; label: string; checked: boolean; rate: number; amount: number; date: string;
}

// [수정] 모든 필드를 포함한 인터페이스 정의
interface ContractData {
    siteName: string;
    address: string;
    
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    
    partnerName: string;
    partnerOwner: string;
    partnerBizNum: string;
    partnerPhone: string;
    partnerAddress: string;
    
    startDate: string;
    endDate: string;
    supplyAmount: number;
    vatAmount: number;
    totalAmount: number;
    asPeriod: number;
    
    paymentTerms: { items: { [key: string]: PaymentItem } } | null;
    customContent: string;
    specialContent: string;
    
    // 체결 데이터 (옵셔널)
    signatureUrl?: string; 
    clientRRN?: string;    
    idCardUrl?: string;    
    signedAt?: any;
    partnerSealUrl?: string; // 파트너 도장
}

interface Props {
    data: ContractData;
    onClose: () => void;
    // [수정] 파트너 전용 기능 (옵셔널)
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
        if (chunkKorean) {
            result = chunkKorean + units[unitIdx] + result;
        }
        unitIdx++;
    }
    return result;
};

const SignedContractViewerModal: React.FC<Props> = ({ data, onClose, onRequestRewrite }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);

    // PDF 저장 (브라우저 인쇄 방식)
    const handleSavePdf = () => {
        if (!contentRef.current) return;
        
        const contentHtml = contentRef.current.innerHTML;
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) {
            alert("팝업 차단을 해제해 주세요.");
            return;
        }

        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>체결계약서_${data.clientName}</title>
                <style>
                    body { font-family: 'Batang', serif; margin: 0; padding: 0; background-color: #fff; }
                    @page { size: A4 portrait; margin: 20mm; }
                    
                    /* 공통 스타일 복사 */
                    .doc-title { text-align: center; font-size: 22pt; font-weight: bold; margin-bottom: 10px; text-decoration: underline; }
                    .doc-subtitle { text-align: center; font-size: 11pt; margin-bottom: 30px; color: #333; }
                    .doc-title-sub { text-align: center; font-size: 18pt; font-weight: bold; margin-bottom: 20px; text-decoration: underline; margin-top: 40px; }
                    
                    .doc-section { margin-bottom: 20px; font-size: 11pt; line-height: 1.6; text-align: justify; }
                    .doc-section.content { white-space: pre-wrap; word-break: break-all; }
                    
                    .special-terms { border: 2px solid #000; padding: 15px; margin-top: 30px; min-height: 100px; page-break-inside: avoid; }
                    .special-terms h4 { margin-top: 0; text-decoration: underline; }
                    
                    /* 표 스타일 */
                    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt; }
                    th, td { border: 1px solid #000; padding: 8px; }
                    th { text-align: center; background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; font-weight: bold; }
                    td.center { text-align: center; }
                    td.right { text-align: right; }
                    .total-row { font-weight: bold; background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; }
                    
                    /* 서명란 및 이미지 */
                    .doc-footer { margin-top: 50px; text-align: center; page-break-inside: avoid; }
                    .date-today { margin: 30px 0; font-size: 12pt; font-weight: bold; }
                    .sign-area { display: flex; justify-content: space-between; gap: 20px; margin-top: 20px; }
                    .sign-box { flex: 1; text-align: left; position: relative; border: 1px solid #ddd; padding: 15px; page-break-inside: avoid; }
                    .sign-role { font-weight: bold; font-size: 12pt; margin-bottom: 10px; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                    .sign-row { margin-bottom: 6px; font-size: 10pt; }
                    .sign-row span { font-weight: bold; width: 90px; display: inline-block; }
                    
                    /* 도장 및 서명 이미지 */
                    .partner-seal-box { position: absolute; right: 10px; bottom: 10px; width: 70px; height: 70px; z-index: 10; opacity: 0.8; }
                    .partner-seal-box img { width: 100%; height: 100%; object-fit: contain; }
                    
                    .signature-display-box { position: absolute; right: 10px; bottom: 10px; width: 100px; height: 60px; z-index: 10; }
                    .sig-img-final { width: 100%; height: 100%; object-fit: contain; }
                    
                    .doc-id-card-section { margin-top: 40px; border-top: 2px dashed #ccc; padding-top: 20px; page-break-before: always; }
                    .id-card-img-doc { max-width: 400px; max-height: 300px; border: 1px solid #ddd; display: block; margin: 10px auto; }
                    
                    .page-break { page-break-before: always; }
                    .doc-appendix-wrapper { margin-top: 50px; }
                </style>
            </head>
            <body>
                ${contentHtml}
            </body>
            </html>
        `);
        printWindow.document.close();

        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
    };

    const getDaysDiff = () => {
        if (!data.startDate || !data.endDate) return '';
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return `${diffDays}일간`;
    };
    
    // 지급 조건 렌더링
    const renderPaymentRows = () => {
        if (!data.paymentTerms) return <tr><td colSpan={4} className="center">별도 협의</td></tr>;
        
        // items가 객체일 수 있으므로 안전하게 처리
        const items = data.paymentTerms.items 
            ? Object.values(data.paymentTerms.items as any).filter((i: any) => i.checked)
            : [];
            
        // 날짜순 정렬
        items.sort((a: any, b: any) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        return items.map((item: any, idx: number) => {
            let displayAmount = item.amount;
            let note = "";
            if (item.id === 'balance') {
                displayAmount += data.vatAmount;
                note = "(VAT포함)";
            }
            return (
                <tr key={idx}>
                    <td className="center">{item.label}</td>
                    <td className="center">{item.rate}%</td>
                    <td className="right">{displayAmount.toLocaleString()} 원 {note && <small>{note}</small>}</td>
                    <td className="center">{item.date || '날짜 미정'}</td>
                </tr>
            );
        });
    };

    const processContent = (text: string) => {
        if (!text) return "";
        let processed = text
            .replace(/{{현장명}}/g, `<strong>${data.siteName}</strong>`)
            .replace(/{{주소}}/g, `<strong>${data.address}</strong>`)
            .replace(/{{착공일}}/g, `<strong>${data.startDate}</strong>`)
            .replace(/{{준공일}}/g, `<strong>${data.endDate}</strong>`)
            .replace(/{{공사일수}}/g, getDaysDiff())
            .replace(/{{총공사금액}}/g, `<strong>일금 ${numberToKorean(data.totalAmount)}원정 (₩ ${data.totalAmount.toLocaleString()})</strong>`)
            .replace(/{{공급가액}}/g, data.supplyAmount.toLocaleString())
            .replace(/{{부가세}}/g, data.vatAmount.toLocaleString())
            .replace(/{{AS기간}}/g, `<strong>${data.asPeriod}</strong>`);
        return processed.split('\n').join('<br/>');
    };

    // 체결 날짜 포맷
    const getSignedDate = () => {
        if (data.signedAt && data.signedAt.toDate) {
            return new Date(data.signedAt.toDate()).toLocaleDateString();
        }
        return new Date().toLocaleDateString();
    };

    return (
        <div className="scv-modal-overlay">
            <div className="scv-modal-content">
                <div className="scv-header">
                    <h3>✅ 체결 완료된 계약서</h3>
                    <div className="scv-actions">
                         <button className="btn-print" onClick={handleSavePdf}>PDF 저장 / 인쇄</button>
                        <button className="btn-close" onClick={onClose}>×</button>
                    </div>
                </div>
                
                <div className="scv-body">
                    <div className="paper-a4" ref={contentRef}>
                        <div className="doc-content-wrapper">
                            <h1 className="doc-title">실내건축 공사 표준계약서</h1>
                            <div className="doc-subtitle">(표준약관 제10079호)</div>

                            <div className="doc-section content">
                                <div dangerouslySetInnerHTML={{ __html: processContent(data.customContent) }} />
                            </div>

                            {data.specialContent && (
                                <div className="doc-section special-terms">
                                    <h4>[특약 사항]</h4>
                                    <div dangerouslySetInnerHTML={{ __html: data.specialContent.replace(/\n/g, '<br/>') }} />
                                </div>
                            )}

                            {data.idCardUrl && (
                                <div className="doc-id-card-section">
                                    <h4>[별첨] 도급인 신분증 사본</h4>
                                    <img src={data.idCardUrl} alt="신분증" className="id-card-img-doc" crossOrigin="anonymous" />
                                </div>
                            )}

                            <div className="doc-footer">
                                <p>위와 같이 계약을 체결하고 이를 증명하기 위하여 본 계약서를 전자문서로 작성하여,<br/>'갑'과 '을'이 전자서명 후 아워프로젝트 서버에 보관한다.</p>
                                <p className="date-today">{getSignedDate()} 체결완료</p>
                                
                                <div className="sign-area">
                                    <div className="sign-box">
                                        <div className="sign-role">"소비자" (갑)</div>
                                        <div className="sign-row"><span>주 소 :</span> {data.clientAddress}</div>
                                        <div className="sign-row"><span>연락처 :</span> {data.clientPhone}</div>
                                        <div className="sign-row"><span>성 명 :</span> {data.clientName} (인)</div>
                                        <div className="sign-row"><span>주민번호 :</span> {data.clientRRN || '************'}</div>
                                        
                                        {/* 고객 서명 이미지 */}
                                        <div className="signature-display-box">
                                            {data.signatureUrl ? (
                                                <img src={data.signatureUrl} alt="서명" className="sig-img-final" crossOrigin="anonymous" />
                                            ) : (
                                                <span className="sig-placeholder">(서명 없음)</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="sign-box">
                                        <div className="sign-role">"시공업자" (을)</div>
                                        <div className="sign-row"><span>상 호 :</span> {data.partnerName}</div>
                                        <div className="sign-row"><span>주 소 :</span> {data.partnerAddress}</div>
                                        <div className="sign-row"><span>연락처 :</span> {data.partnerPhone}</div>
                                        <div className="sign-row"><span>등록번호 :</span> {data.partnerBizNum}</div>
                                        <div className="sign-row"><span>대표자 :</span> {data.partnerOwner} (인)</div>
                                        
                                        {/* 파트너 도장 이미지 */}
                                        {data.partnerSealUrl && (
                                            <div className="partner-seal-box">
                                                <img src={data.partnerSealUrl} alt="직인" crossOrigin="anonymous" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="doc-appendix-wrapper page-break">
                            <h2 className="doc-title-sub">[별첨] 공사대금 지급 조건</h2>
                            <div className="payment-table-container">
                                <table>
                                    <thead><tr><th>구분</th><th>비율</th><th>금액 (VAT 포함)</th><th>지급 예정일</th></tr></thead>
                                    <tbody>{renderPaymentRows()}</tbody>
                                    <tfoot>
                                        <tr className="total-row">
                                            <td className="center">합계</td>
                                            <td className="center">100%</td>
                                            <td className="right">{data.totalAmount.toLocaleString()} 원</td>
                                            <td className="center">-</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <div className="payment-note">
                                <p>※ 입금 계좌 : {data.partnerName} 지정 계좌</p>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="scv-footer">
                    {/* 파트너일 때만 보이는 재작성 요청 버튼 */}
                    {onRequestRewrite && (
                        <button className="btn-rewrite" onClick={onRequestRewrite}>
                            🔄 계약서 다시 작성하기
                        </button>
                    )}
                    <button className="btn-save-pdf" onClick={handleSavePdf}>PDF 저장 / 인쇄</button>
                    <button className="btn-close-bottom" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
};

export default SignedContractViewerModal;