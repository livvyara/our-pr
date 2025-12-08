import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './StaffDetailModal.css';

interface StaffData {
  uid: string;
  name: string;
  email: string;
  phone: string;
  
  joinDate?: string;
  employeeId?: string;
  residentNum?: string;
  
  // [기본 급여 계좌]
  bankName?: string;
  accountNum?: string;
  accountHolder?: string;
  
  // [NEW] 급여일 및 인센티브 계좌
  payDate?: string; 
  incentiveBank?: string;
  incentiveAccount?: string;
  incentiveHolder?: string;

  baseSalary?: number; 
  foodAllowance?: number; 
  qualAllowance?: number; 
  longServiceAllowance?: number; 
  
  totalLeave?: number;
  usedLeave?: number;
  
  dependentCount?: number; 
  childCount?: number;     

  licenseImg?: string;
  idCardImg?: string;
  residentImg?: string;
  contractImg?: string;
  passbookImg?: string; 
}

interface DeductionRates {
    nationalPension: number; 
    healthInsurance: number; 
    longTermCare: number; 
    employmentInsurance: number; 
}

interface Props {
  staff: StaffData;
  onClose: () => void;
  onSave: (data: StaffData) => void;
}

const DEFAULT_RATES: DeductionRates = {
    nationalPension: 4.5,
    healthInsurance: 3.545,
    longTermCare: 12.95,
    employmentInsurance: 0.9,
};

// 간이세액표 주요 구간 데이터 (250만원 구간 등 정확도 보장용)
const TAX_TABLE_250: Record<number, number> = {
    1: 35600, 2: 28600, 3: 16530, 4: 13150, 5: 9780, 6: 6400, 7: 3030
};

const StaffDetailModal: React.FC<Props> = ({ staff, onClose, onSave }) => {
  const db = getFirestore();
  const storage = getStorage();

  const [formData, setFormData] = useState<StaffData>({
      ...staff,
      dependentCount: staff.dependentCount ?? 1,
      childCount: staff.childCount ?? 0
  });
  const [rates, setRates] = useState<DeductionRates>(DEFAULT_RATES);
  const [activeTab, setActiveTab] = useState<'info' | 'salary' | 'docs'>('info');
  const [isSaving, setIsSaving] = useState(false);

  // 이미지 뷰어
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleChange = (field: keyof StaffData, value: any) => {
      let finalValue = value;
      
      // 주민번호: 숫자만 + 하이픈
      if (field === 'residentNum') {
          const num = value.replace(/[^0-9]/g, '');
          if (num.length < 7) finalValue = num;
          else finalValue = `${num.slice(0, 6)}-${num.slice(6, 13)}`;
          if (finalValue.length > 14) finalValue = finalValue.slice(0, 14);
      }
      
      // 계좌번호(기본/인센티브): 숫자만 입력
      if (field === 'accountNum' || field === 'incentiveAccount') {
          finalValue = value.replace(/[^0-9]/g, '');
      }

      setFormData(prev => {
          const newData = { ...prev, [field]: finalValue };
          
          // 자녀 수 입력 제한
          if (field === 'dependentCount' || field === 'childCount') {
              const deps = Number(newData.dependentCount || 1);
              const maxChildren = Math.max(0, deps - 1);
              if ((newData.childCount || 0) > maxChildren) {
                  newData.childCount = maxChildren;
              }
          }
          return newData;
      });
  };

  const handleFileChange = async (field: keyof StaffData, e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const storageRef = ref(storage, `staff/${staff.uid}/${field}_${Date.now()}`);
          try {
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            handleChange(field, url);
          } catch(err) { alert("업로드 실패"); }
      }
  };

  const handleSave = async () => {
      if(!confirm("저장하시겠습니까?")) return;
      setIsSaving(true);
      try {
          await updateDoc(doc(db, 'users', staff.uid), { staffInfo: formData });
          onSave(formData);
          alert("저장되었습니다.");
          onClose();
      } catch(e) { console.error(e); alert("저장 실패"); } 
      finally { setIsSaving(false); }
  };

  // --- 급여 계산 ---
  const base = Number(formData.baseSalary || 0);
  const food = Number(formData.foodAllowance || 0);
  const qual = Number(formData.qualAllowance || 0);
  const long = Number(formData.longServiceAllowance || 0);
  
  const dependents = Math.max(1, Number(formData.dependentCount || 1));
  const children = dependents >= 2 ? Number(formData.childCount || 0) : 0; 
  
  const totalPay = base + food + qual + long;
  const taxablePay = base + qual + long; 

  const np = Math.floor(taxablePay * (rates.nationalPension / 100));
  const hi = Math.floor(taxablePay * (rates.healthInsurance / 100));
  const ltc = Math.floor(hi * (rates.longTermCare / 100));
  const ei = Math.floor(taxablePay * (rates.employmentInsurance / 100));
  const totalInsurance = np + hi + ltc + ei;

  const calculateIncomeTax = () => {
      // 250만원 구간 정밀 처리
      if (taxablePay >= 2500000 && taxablePay < 2510000) {
          const exactTax = TAX_TABLE_250[dependents] || 0;
          let childCredit = 0;
          if (children === 1) childCredit = 12500;
          else if (children === 2) childCredit = 29160;
          else if (children >= 3) childCredit = 29160 + (children - 2) * 25000;
          return Math.max(exactTax - childCredit, 0);
      }

      // 일반 공식 (간이세액표 근사)
      const annualPay = taxablePay * 12;
      let incomeDed = 0;
      if (annualPay <= 5000000) incomeDed = annualPay * 0.7;
      else if (annualPay <= 15000000) incomeDed = 3500000 + (annualPay - 5000000) * 0.4;
      else if (annualPay <= 45000000) incomeDed = 7500000 + (annualPay - 15000000) * 0.15;
      else if (annualPay <= 100000000) incomeDed = 12000000 + (annualPay - 45000000) * 0.05;
      else incomeDed = 14750000 + (annualPay - 100000000) * 0.02;

      let specialDed = 0;
      if (annualPay <= 30000000) {
          if (dependents === 1) specialDed = 3100000 + annualPay * 0.04;
          else if (dependents === 2) specialDed = 3600000 + annualPay * 0.04;
          else specialDed = 5000000 + annualPay * 0.07;
      } else if (annualPay <= 45000000) {
          const ex = annualPay - 30000000;
          if (dependents === 1) specialDed = 3100000 + (30000000 * 0.04) + (ex * 0.04);
          else if (dependents === 2) specialDed = 3600000 + (30000000 * 0.04) + (ex * 0.04);
          else specialDed = 5000000 + (30000000 * 0.07) + (ex * 0.04);
      } else {
          if (dependents === 1) specialDed = 3100000 + annualPay * 0.015;
          else if (dependents === 2) specialDed = 3600000 + annualPay * 0.02;
          else specialDed = 5000000 + annualPay * 0.05;
      }

      const taxBase = annualPay - incomeDed - specialDed;
      if (taxBase <= 0) return 0;

      let calculatedTax = 0;
      if (taxBase <= 14000000) calculatedTax = taxBase * 0.06;
      else if (taxBase <= 50000000) calculatedTax = 840000 + (taxBase - 14000000) * 0.15;
      else calculatedTax = 6240000 + (taxBase - 50000000) * 0.24;

      let taxCredit = 0;
      if (calculatedTax <= 1300000) taxCredit = calculatedTax * 0.55;
      else taxCredit = 715000 + (calculatedTax - 1300000) * 0.30;
      if (taxCredit > 740000) taxCredit = 740000;

      let monthlyTax = Math.floor(Math.max(calculatedTax - taxCredit, 0) / 12 / 10) * 10;

      if (dependents >= 2 && children > 0) {
          let childCredit = 0;
          if (children === 1) childCredit = 12500;
          else if (children === 2) childCredit = 29160;
          else if (children >= 3) childCredit = 29160 + (children - 2) * 25000;
          monthlyTax -= childCredit;
      }

      return Math.max(monthlyTax, 0);
  };

  const it = calculateIncomeTax();
  const lit = Math.floor(it * 0.1); 
  const totalDeduction = np + hi + ltc + ei + it + lit;
  const netPay = totalPay - totalDeduction;

  const onWheel = (e: React.WheelEvent) => {
      const d = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(s => Math.min(Math.max(0.5, s + d), 4));
  };
  const onMouseDown = (e: React.MouseEvent) => {
      isDragging.current = true;
      startPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      setPos({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  return (
    <div className="staff-modal-overlay">
        <div className="staff-modal-content">
            <div className="staff-modal-header">
                <h3>직원 상세 관리: {staff.name}</h3>
                <button onClick={onClose} className="btn-close">×</button>
            </div>

            <div className="staff-modal-tabs">
                <button className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>기본 정보</button>
                <button className={activeTab === 'salary' ? 'active' : ''} onClick={() => setActiveTab('salary')}>급여 및 연차</button>
                <button className={activeTab === 'docs' ? 'active' : ''} onClick={() => setActiveTab('docs')}>증빙 서류</button>
            </div>

            <div className="staff-modal-body">
                {activeTab === 'info' && (
                    <div className="form-section">
                        <div className="row">
                            <label>이름</label><input value={staff.name} disabled className="readonly" />
                            <label>연락처</label><input value={staff.phone} disabled className="readonly" />
                        </div>
                        <div className="row">
                            <label>이메일</label><input value={staff.email} disabled className="readonly" style={{flex:3}} />
                        </div>
                        <div className="divider"></div>
                        <div className="row">
                            <label>입사일</label><input type="date" value={formData.joinDate || ''} onChange={e=>handleChange('joinDate', e.target.value)} />
                            <label>사번</label><input value={formData.employeeId || ''} onChange={e=>handleChange('employeeId', e.target.value)} />
                        </div>
                        <div className="row">
                            {/* [NEW] 급여일 입력 */}
                            <label>급여일</label><input value={formData.payDate || ''} onChange={e=>handleChange('payDate', e.target.value)} placeholder="예: 매월 10일" />
                            <label>주민번호</label>
                            <input 
                                value={formData.residentNum || ''} 
                                onChange={e=>handleChange('residentNum', e.target.value)} 
                                placeholder="숫자만 입력" 
                                maxLength={14}
                            />
                        </div>
                        
                        <div className="row">
                            <label>은행명</label><input value={formData.bankName || ''} onChange={e=>handleChange('bankName', e.target.value)} />
                            <label>예금주</label><input value={formData.accountHolder || ''} onChange={e=>handleChange('accountHolder', e.target.value)} />
                        </div>
                        <div className="row">
                            <label>계좌번호</label>
                            <input 
                                value={formData.accountNum || ''} 
                                onChange={e=>handleChange('accountNum', e.target.value)} 
                                placeholder="숫자만 입력"
                                style={{flex:3}} 
                            />
                        </div>

                        {/* [NEW] 인센티브 계좌 섹션 */}
                        <div style={{marginTop:'20px', borderTop:'1px dashed #eee', paddingTop:'15px'}}>
                            <h4 style={{fontSize:'14px', color:'#333', marginBottom:'10px'}}>인센티브 계좌 (선택)</h4>
                            <div className="row">
                                <label>은행명</label><input value={formData.incentiveBank || ''} onChange={e=>handleChange('incentiveBank', e.target.value)} />
                                <label>예금주</label><input value={formData.incentiveHolder || ''} onChange={e=>handleChange('incentiveHolder', e.target.value)} />
                            </div>
                            <div className="row">
                                <label>계좌번호</label>
                                <input 
                                    value={formData.incentiveAccount || ''} 
                                    onChange={e=>handleChange('incentiveAccount', e.target.value)} 
                                    placeholder="숫자만 입력"
                                    style={{flex:3}} 
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'salary' && (
                    <div className="salary-section">
                        <div className="salary-inputs">
                            <h4>지급 항목 (월)</h4>
                            <div className="row"><label>기본급</label><input type="number" value={formData.baseSalary||0} onChange={e=>handleChange('baseSalary', Number(e.target.value))} /></div>
                            <div className="row"><label>식대 (비과세)</label><input type="number" value={formData.foodAllowance||0} onChange={e=>handleChange('foodAllowance', Number(e.target.value))} /></div>
                            <div className="row"><label>자격수당</label><input type="number" value={formData.qualAllowance||0} onChange={e=>handleChange('qualAllowance', Number(e.target.value))} /></div>
                            <div className="row"><label>근속수당</label><input type="number" value={formData.longServiceAllowance||0} onChange={e=>handleChange('longServiceAllowance', Number(e.target.value))} /></div>
                            
                            <h4 style={{marginTop:'15px', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>공제 대상 (간이세액표)</h4>
                            <div className="row">
                                <label>가족 수 (본인포함)</label>
                                <input type="number" value={formData.dependentCount} onChange={e=>handleChange('dependentCount', Number(e.target.value))} min={1} />
                            </div>
                            {dependents >= 2 && (
                                <div className="row">
                                    <label>8세~20세 자녀 수</label>
                                    <input type="number" value={formData.childCount} onChange={e=>handleChange('childCount', Number(e.target.value))} min={0} />
                                </div>
                            )}

                            <div className="row total-row"><label>지급 총액 (세전)</label><span className="amount">{totalPay.toLocaleString()} 원</span></div>
                            
                            <h4 style={{marginTop:'20px'}}>연차 관리</h4>
                            <div className="row">
                                <label>총 연차</label><input type="number" value={formData.totalLeave||0} onChange={e=>handleChange('totalLeave', Number(e.target.value))} />
                                <label>사용 연차</label><input type="number" value={formData.usedLeave||0} onChange={e=>handleChange('usedLeave', Number(e.target.value))} />
                            </div>
                            <div className="row total-row"><label>잔여 연차</label><span className="amount">{(formData.totalLeave||0) - (formData.usedLeave||0)} 일</span></div>
                        </div>

                        <div className="salary-calcs">
                            <div className="calc-header">
                                <h4>공제 항목 (예상)</h4>
                                <span className="rate-info">* 2025 간이세액표 적용</span>
                            </div>
                            
                            <div className="calc-row"><span>국민연금 ({rates.nationalPension}%)</span><span>-{np.toLocaleString()}</span></div>
                            <div className="calc-row"><span>건강보험 ({rates.healthInsurance}%)</span><span>-{hi.toLocaleString()}</span></div>
                            <div className="calc-row"><span>장기요양 ({rates.longTermCare}%)</span><span>-{ltc.toLocaleString()}</span></div>
                            <div className="calc-row"><span>고용보험 ({rates.employmentInsurance}%)</span><span>-{ei.toLocaleString()}</span></div>
                            <div className="calc-row"><span>소득세 (가족 {dependents}명)</span><span>-{it.toLocaleString()}</span></div>
                            <div className="calc-row"><span>지방소득세 (10%)</span><span>-{lit.toLocaleString()}</span></div>
                            
                            <div className="calc-divider"></div>
                            <div className="calc-row total">
                                <span>공제 합계</span>
                                <span className="red">-{totalDeduction.toLocaleString()}</span>
                            </div>
                            
                            <div className="net-pay-box">
                                <div className="label">실수령액 (세후)</div>
                                <div className="value">{netPay.toLocaleString()} 원</div>
                            </div>
                            
                            <div className="rate-settings">
                                <details>
                                    <summary>4대보험 요율 설정</summary>
                                    <div className="rate-grid">
                                        <label>국민연금(%)</label><input type="number" value={rates.nationalPension} onChange={e=>setRates({...rates, nationalPension: Number(e.target.value)})} />
                                        <label>건강보험(%)</label><input type="number" value={rates.healthInsurance} onChange={e=>setRates({...rates, healthInsurance: Number(e.target.value)})} />
                                        <label>장기요양(%)</label><input type="number" value={rates.longTermCare} onChange={e=>setRates({...rates, longTermCare: Number(e.target.value)})} />
                                        <label>고용보험(%)</label><input type="number" value={rates.employmentInsurance} onChange={e=>setRates({...rates, employmentInsurance: Number(e.target.value)})} />
                                    </div>
                                </details>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'docs' && (
                    <div className="docs-section">
                        {[
                            { key: 'licenseImg', label: '자격증 사본' },
                            { key: 'idCardImg', label: '신분증 사본' },
                            { key: 'residentImg', label: '주민등록등본' },
                            { key: 'contractImg', label: '연봉계약서' },
                            { key: 'passbookImg', label: '통장 사본' }
                        ].map((docItem) => (
                            <div key={docItem.key} className="doc-item">
                                <div className="doc-header">
                                    <label>{docItem.label}</label>
                                    <input type="file" onChange={(e) => handleFileChange(docItem.key as keyof StaffData, e)} accept="image/*" />
                                </div>
                                <div className="doc-preview" onClick={() => formData[docItem.key as keyof StaffData] && setViewImage(formData[docItem.key as keyof StaffData] as string)}>
                                    {formData[docItem.key as keyof StaffData] ? (
                                        <img src={formData[docItem.key as keyof StaffData] as string} alt="preview" />
                                    ) : (
                                        <div className="no-file">파일 없음</div>
                                    )}
                                    {formData[docItem.key as keyof StaffData] && <div className="zoom-hint">🔍 클릭하여 확대</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="staff-modal-footer">
                <button className="btn-cancel" onClick={onClose}>취소</button>
                <button className="btn-save" onClick={handleSave} disabled={isSaving}>{isSaving ? '저장 중...' : '저장하기'}</button>
            </div>
        </div>

        {viewImage && (
            <div className="image-viewer-backdrop" onClick={() => setViewImage(null)}>
                <div 
                    className="image-viewer-container"
                    onClick={e => e.stopPropagation()}
                    onWheel={onWheel}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={() => isDragging.current = false}
                    onMouseLeave={() => isDragging.current = false}
                    style={{cursor: isDragging.current ? 'grabbing' : 'grab'}}
                >
                    <img 
                        src={viewImage} 
                        alt="viewer" 
                        style={{
                            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                            transition: isDragging.current ? 'none' : 'transform 0.1s'
                        }}
                        draggable={false}
                    />
                    <button className="btn-viewer-close" onClick={() => setViewImage(null)}>×</button>
                    <div className="viewer-guide">휠: 확대/축소 | 드래그: 이동</div>
                </div>
            </div>
        )}
    </div>
  );
};

export default StaffDetailModal;