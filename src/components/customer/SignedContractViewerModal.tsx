import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './SignedContractViewerModal.css';

interface PaymentItem {
    id: string; label: string; checked: boolean; rate: number; amount: number; date: string;
}
interface ContractData {
    siteName: string; address: string; clientName: string; clientPhone: string; clientAddress: string;
    partnerName: string; partnerOwner: string; partnerBizNum: string; partnerPhone: string; partnerAddress: string;
    startDate: string; endDate: string; supplyAmount: number; vatAmount: number; totalAmount: number; asPeriod: number;
    paymentTerms: { items: { [key: string]: PaymentItem } } | null;
    customContent: string; specialContent: string;
    
    signatureUrl?: string; 
    clientRRN?: string;    
    idCardUrl?: string;    
    signedAt?: any;
    partnerSealUrl?: string;
}

interface Props {
    data: ContractData;
    onClose: () => void;
    // [NEW] 재작성 요청 핸들러 (파트너용)
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

    const handleSavePdf = async () => {
        if (!contentRef.current) return;
        setIsSaving(true);
        try {
            const canvas = await html2canvas(contentRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: true });
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
            pdf.save(`체결계약서_${data.clientName}.pdf`);
        } catch (e) {
            console.error(e);
            alert("PDF 저장 중 오류가 발생했습니다.");
        } finally {
            setIsSaving(false);
        }
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
        const items = Object.values(data.paymentTerms.items as any).filter((i: any) => i.checked);
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

    return (
        <div className="scv-modal-overlay">
            <div className="scv-modal-content">
                <div className="scv-header">
                    <h3>✅ 체결 완료된 계약서</h3>
                    <div className="scv-actions">
                        <button className="btn-save-pdf" onClick={handleSavePdf} disabled={isSaving}>
                            {isSaving ? '저장 중...' : 'PDF 저장'}
                        </button>
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
                                <p className="date-today">{data.signedAt ? new Date(data.signedAt.toDate()).toLocaleDateString() : new Date().toLocaleDateString()} 체결완료</p>
                                
                                <div className="sign-area">
                                    <div className="sign-box" style={{position:'relative'}}>
                                        <div className="sign-role">"소비자" (갑)</div>
                                        <div className="sign-row"><span>주 소 :</span> {data.clientAddress}</div>
                                        <div className="sign-row"><span>연락처 :</span> {data.clientPhone}</div>
                                        <div className="sign-row"><span>성 명 :</span> {data.clientName} (인)</div>
                                        <div className="sign-row"><span>주민번호 :</span> {data.clientRRN || '************'}</div>
                                        
                                        <div className="signature-display-box" style={{position:'absolute', right:'10px', bottom:'10px', width:'100px', height:'60px', zIndex: 100}}>
                                            {data.signatureUrl ? (
                                                <img src={data.signatureUrl} alt="서명" className="sig-img-final" crossOrigin="anonymous" style={{width:'100%', height:'100%', objectFit:'contain'}} />
                                            ) : (
                                                <span className="sig-placeholder" style={{color:'#ccc', fontSize:'11px'}}>(서명 없음)</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="sign-box" style={{position:'relative'}}>
                                        <div className="sign-role">"시공업자" (을)</div>
                                        <div className="sign-row"><span>상 호 :</span> {data.partnerName}</div>
                                        <div className="sign-row"><span>주 소 :</span> {data.partnerAddress}</div>
                                        <div className="sign-row"><span>연락처 :</span> {data.partnerPhone}</div>
                                        <div className="sign-row"><span>등록번호 :</span> {data.partnerBizNum}</div>
                                        <div className="sign-row"><span>대표자 :</span> {data.partnerOwner} (인)</div>

                                        {data.partnerSealUrl && (
                                            <div className="partner-seal-box" style={{
                                                position: 'absolute', right: '10px', bottom: '10px', 
                                                width: '80px', height: '80px', opacity: 0.8, zIndex: 50
                                            }}>
                                                <img src={data.partnerSealUrl} alt="직인" style={{width:'100%', height:'100%', objectFit:'contain'}} crossOrigin="anonymous" />
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
                    {/* [NEW] 파트너 전용 재작성 요청 버튼 */}
                    {onRequestRewrite && (
                        <button 
                            className="btn-rewrite" 
                            onClick={onRequestRewrite}
                            style={{marginRight: 'auto', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #d32f2f'}}
                        >
                            🔄 계약서 다시 작성하기
                        </button>
                    )}
                    <button className="btn-close-bottom" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
};

export default SignedContractViewerModal;