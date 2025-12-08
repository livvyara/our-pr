import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import './ElectronicContractSignModal.css';

interface PaymentItem {
    id: string; label: string; checked: boolean; rate: number; amount: number; date: string;
}
interface ContractData {
    siteName: string; address: string; clientName: string; clientPhone: string; clientAddress: string;
    partnerName: string; partnerOwner: string; partnerBizNum: string; partnerPhone: string; partnerAddress: string;
    startDate: string; endDate: string; supplyAmount: number; vatAmount: number; totalAmount: number; asPeriod: number;
    paymentTerms: { items: { [key: string]: PaymentItem } } | null;
    customContent: string; specialContent: string;
    partnerSealUrl?: string; // 파트너 도장
}

interface Props {
    siteId: string;
    partnerUid: string;
    data: ContractData;
    onClose: () => void;
    onSignedSuccess: () => void;
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

const ElectronicContractSignModal: React.FC<Props> = ({ siteId, partnerUid, data, onClose, onSignedSuccess }) => {
    const db = getFirestore();
    const storage = getStorage();
    
    const sigCanvas = useRef<SignatureCanvas>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [residentNum, setResidentNum] = useState('');
    const [idCardFile, setIdCardFile] = useState<File | null>(null);
    const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
    const [signatureImg, setSignatureImg] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    // [수정] 오류 유발 함수(getTrimmedCanvas) 제거 -> getCanvas 사용
    const handleEndStroke = () => {
        if (sigCanvas.current) {
            setSignatureImg(sigCanvas.current.getCanvas().toDataURL('image/png'));
        }
    };

    const handleClear = () => {
        sigCanvas.current?.clear();
        setSignatureImg(null);
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

    const handleSubmit = async () => {
        if (residentNum.length < 14) return alert("주민등록번호를 올바르게 입력해주세요.");
        if (!idCardFile) return alert("신분증 사본을 첨부해주세요.");
        if (sigCanvas.current?.isEmpty()) return alert("서명을 해주세요.");
        
        if (!confirm("계약을 체결하시겠습니까?\n체결 후에는 수정할 수 없습니다.")) return;

        setIsSubmitting(true);
        try {
            // [수정] 1. 서명 이미지 추출 (getCanvas 사용)
            const signatureDataUrl = sigCanvas.current 
                ? sigCanvas.current.getCanvas().toDataURL('image/png') 
                : '';
            
            if (!signatureDataUrl) throw new Error("서명 데이터를 가져올 수 없습니다.");

            // 2. 신분증 업로드
            const idCardRef = ref(storage, `users/${partnerUid}/sites/${siteId}/contracts/id_card_${Date.now()}`);
            await uploadBytes(idCardRef, idCardFile);
            const idCardUrl = await getDownloadURL(idCardRef);

            // 3. 계약서 PDF 생성
            let pdfUrl = '';
            if (contentRef.current) {
                // PDF 생성 전 잠시 대기
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const canvas = await html2canvas(contentRef.current, { 
                    scale: 2, 
                    backgroundColor: '#ffffff',
                    useCORS: true // [중요] CORS 필수
                });
                
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

                // PDF 업로드
                const pdfRef = ref(storage, `users/${partnerUid}/sites/${siteId}/contracts/contract_${Date.now()}.pdf`);
                await uploadBytes(pdfRef, pdfBlob);
                pdfUrl = await getDownloadURL(pdfRef);
            }

            // 4. Firestore 업데이트
            await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId), {
                'contract.status': 'signed',
                'contract.signedAt': serverTimestamp(),
                'contract.clientRRN': residentNum,
                'contract.idCardUrl': idCardUrl,
                'contract.pdfUrl': pdfUrl, 
                'contract.signatureUrl': signatureDataUrl 
            });

            alert("전자계약 체결이 완료되었습니다.");
            onSignedSuccess();
            onClose();

        } catch (e: any) {
            console.error("Contract Submit Error:", e);
            alert(`처리 중 오류가 발생했습니다.\n${e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="ecs-modal-overlay">
            <div className="ecs-modal-content">
                <div className="ecs-header">
                    <h3>✍️ 전자계약 체결</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>

                <div className="ecs-body">
                    <div className="ecs-scroll-area">
                        {/* 계약서 본문 */}
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

                                {/* 신분증 미리보기 */}
                                {idCardPreview && (
                                    <div className="doc-id-card-section">
                                        <h4>[별첨] 도급인 신분증 사본</h4>
                                        <img src={idCardPreview} alt="신분증" className="id-card-img-doc" />
                                    </div>
                                )}

                                <div className="doc-footer">
                                    <p>위와 같이 계약을 체결하고 이를 증명하기 위하여 본 계약서를 전자문서로 작성하여,<br/>'갑'과 '을'이 전자서명 후 아워프로젝트 서버에 보관한다.</p>
                                    <p className="date-today">{new Date().toLocaleDateString()} 작성</p>
                                    
                                    <div className="sign-area">
                                        <div className="sign-box" style={{position:'relative'}}>
                                            <div className="sign-role">"소비자" (갑)</div>
                                            <div className="sign-row"><span>주 소 :</span> {data.clientAddress}</div>
                                            <div className="sign-row"><span>연락처 :</span> {data.clientPhone}</div>
                                            <div className="sign-row"><span>성 명 :</span> {data.clientName} (인)</div>
                                            <div className="sign-row"><span>주민번호 :</span> {residentNum || '____________'}</div>
                                            
                                            {/* 서명 미리보기 (실시간) */}
                                            <div className="signature-display-box" style={{
                                                position:'absolute', right:'20px', bottom:'20px', 
                                                width:'100px', height:'60px', zIndex: 10
                                            }}>
                                                {signatureImg ? (
                                                    <img src={signatureImg} alt="서명" className="sig-img-final" style={{width:'100%', height:'100%', objectFit:'contain'}} />
                                                ) : (
                                                    <span className="sig-placeholder" style={{color:'#ccc', fontSize:'11px'}}>(서명란)</span>
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
                                            
                                            {/* 파트너 도장 */}
                                            {data.partnerSealUrl && (
                                                <div className="partner-seal-box" style={{
                                                    position: 'absolute', right: '10px', bottom: '10px', 
                                                    width: '80px', height: '80px', opacity: 0.8, zIndex: 10
                                                }}>
                                                    <img 
                                                        src={data.partnerSealUrl} 
                                                        alt="직인" 
                                                        style={{width:'100%', height:'100%', objectFit:'contain'}}
                                                        crossOrigin="anonymous" 
                                                    />
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
                                        <thead><tr><th>구분</th><th>비율</th><th>금액</th><th>지급일</th></tr></thead>
                                        <tbody>{renderPaymentRows()}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        {/* 입력 영역 */}
                        <div className="ecs-input-area">
                            <h4>📝 필수 정보 입력 및 서명</h4>
                            <div className="sign-input-group">
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
                            <div className="sign-input-group">
                                <label>신분증 사본 첨부 <span className="req">*</span></label>
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={handleIdCardChange} 
                                    className="ecs-file-input"
                                />
                            </div>
                            <div className="signature-pad-wrapper">
                                <label>전자 서명 <span className="req">*</span></label>
                                <div className="sig-canvas-container">
                                    <SignatureCanvas 
                                        ref={sigCanvas}
                                        penColor="black"
                                        canvasProps={{width: 300, height: 150, className: 'sigCanvas'}} 
                                        onEnd={handleEndStroke}
                                    />
                                    <div className="sig-guide">박스 안에 서명해 주세요</div>
                                </div>
                                <button className="btn-clear-sig" onClick={handleClear}>다시 서명하기</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="ecs-footer">
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-sign-submit" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? '계약 체결 완료' : '계약 체결 완료'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ElectronicContractSignModal;