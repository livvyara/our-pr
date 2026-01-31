import React, { useState, useRef } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../firebase-config'; // auth 가져오기
import './ContractEditorModal.css';
import { K_BRAND_COLOR } from '../../constants';

interface Props {
    initialContent: string;
    initialSpecial: string;
    initialSealUrl?: string; // [NEW] 기존 도장 URL
    onSave: (content: string, special: string, sealUrl: string) => void; // [NEW] sealUrl 추가
    onClose: () => void;
}

export const DEFAULT_CONTRACT_TEXT = `제1조 (목적)
이 계약서는 실내건축 공사를 의뢰한 소비자와 시공업자와 사이에 체결된 공사 계약상의 권리·의무 및 책임에 관한 사항을 규정함을 목적으로 한다.
(중략... 기존 표준약관 내용 유지)
...
제12조 (관할법원)
이 계약과 관련된 분쟁에 관한 소송은 민사소송법상의 관할법원에 제기하여야 한다.

<소비자 유의사항>
공사예정금액이 1,500만원 이상인 경우에는 사업자가 「건설산업기본법」에 따라 전문건설업에 등록한 업체인지 확인(건설업등록증 및 건설업수첩)하는 것이 좋습니다.

[전자계약 체결 안내]
1. 본 계약은 전자서명법 등 관련 법령에 따라 공인된 전자서명 방식으로 체결됩니다.
2. 체결된 계약서는 전자문서 형태로 730디자인그룹 서버에 안전하게 보관됩니다.
3. "소비자"와 "시공업자"는 언제든지 서비스 내에서 본 계약서를 열람하거나 출력 및 다운로드할 수 있습니다.`;

const ContractEditorModal: React.FC<Props> = ({ initialContent, initialSpecial, initialSealUrl, onSave, onClose }) => {
    const [content, setContent] = useState(initialContent || DEFAULT_CONTRACT_TEXT);
    const [special, setSpecial] = useState(initialSpecial || '');
    const [sealUrl, setSealUrl] = useState(initialSealUrl || '');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 도장 이미지 업로드 핸들러
    const handleSealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        const user = auth.currentUser;
        if (!user) return;

        setIsUploading(true);
        try {
            const storage = getStorage();
            const storageRef = ref(storage, `users/${user.uid}/config/partner_seal_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setSealUrl(url);
        } catch (error) {
            console.error("Upload failed", error);
            alert("이미지 업로드에 실패했습니다.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = () => {
        if (!sealUrl) {
            alert("전자계약을 위해 [직인/인감] 이미지는 필수입니다.\n등록해 주세요.");
            return;
        }
        onSave(content, special, sealUrl);
    };

    return (
        <div className="ce-modal-overlay">
            <div className="ce-modal-content">
                <div className="ce-header">
                    <h3>📝 계약서 양식 및 인감 관리</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                <div className="ce-body">
                    {/* 1. 계약서 본문 */}
                    <div className="editor-section">
                        <label>제 1항 ~ 일반 조항 (표준 약관)</label>
                        <p className="ce-guide">※ {'{{...}}'} 로 표시된 부분은 데이터가 자동으로 입력되는 변수입니다. 지우지 마세요.</p>
                        <textarea 
                            className="ce-textarea main" 
                            value={content} 
                            onChange={(e) => setContent(e.target.value)} 
                        />
                    </div>
                    
                    {/* 2. 특약 사항 */}
                    <div className="editor-section">
                        <label>특약 사항 (추가 조항)</label>
                        <textarea 
                            className="ce-textarea special" 
                            value={special} 
                            onChange={(e) => setSpecial(e.target.value)} 
                            placeholder="예: 폐기물 처리 비용은 별도로 한다. / 싱크대는 별도 발주 등"
                        />
                    </div>

                    {/* [NEW] 3. 직인/인감 등록 섹션 */}
                    <div className="editor-section seal-section" style={{borderTop:'1px dashed #ccc', paddingTop:'20px', marginTop:'10px'}}>
                        <label>시공자 직인/인감 (필수)</label>
                        <p className="ce-guide" style={{background:'#fff3e0', color:'#e65100'}}>
                            * 전자계약서 하단 '시공업자'란에 날인될 도장 이미지를 등록해주세요.<br/>
                            * 배경이 투명한 PNG 이미지를 권장합니다. (법인인감 또는 대표자 도장)
                        </p>
                        <div className="seal-upload-box">
                            <div className="seal-preview">
                                {sealUrl ? (
                                    <img src={sealUrl} alt="직인 미리보기" />
                                ) : (
                                    <div className="no-seal">이미지 없음</div>
                                )}
                            </div>
                            <div className="seal-actions">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={fileInputRef}
                                    style={{display:'none'}}
                                    onChange={handleSealUpload}
                                />
                                <button className="btn-upload" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                                    {isUploading ? '업로드 중...' : '도장 이미지 등록/변경'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="ce-footer">
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-save" style={{backgroundColor: K_BRAND_COLOR}} onClick={handleSave}>
                        저장하기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContractEditorModal;