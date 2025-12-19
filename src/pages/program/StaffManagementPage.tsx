import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import Header from '../../components/common/Header';
import Footer from '../../components/common/Footer';
import RoleHeader from '../../components/common/RoleHeader';
import StaffDetailModal from '../../components/partner/StaffDetailModal';
import PayrollExecutionModal from '../../components/partner/PayrollExecutionModal'; 
import PayrollDateSettingModal from '../../components/partner/PayrollDateSettingModal';
import BonusManagementModal from '../../components/partner/BonusManagementModal'; // [NEW] 추가됨
import './StaffManagementPage.css';

// [수정] StaffData 인터페이스 전체 정의 (payDate 포함)
interface StaffData {
  uid: string;
  name: string;
  email: string;
  phone: string;
  joinDate?: string;
  employeeId?: string;
  residentNum?: string;
  bankName?: string;
  accountNum?: string;
  accountHolder?: string;
  
  // [중요] 이 부분이 누락되어 오류가 발생했습니다.
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

interface Props {
  partnerUid: string;
}

const StaffManagementPage: React.FC<Props> = ({ partnerUid }) => {
  const db = getFirestore();
  const [staffList, setStaffList] = useState<StaffData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffData | null>(null);

  // 모달 상태
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isDateSettingModalOpen, setIsDateSettingModalOpen] = useState(false);
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false); // [NEW] 상여 모달 상태

  const [payrollBaseDate, setPayrollBaseDate] = useState(1);

  useEffect(() => {
    // ... (기존 useEffect 데이터 로딩 로직 동일)
    const fetchStaff = async () => {
      if (!partnerUid) return;
      try {
        const q = query(
            collection(db, 'users'), 
            where('partnerInfo.ownerUid', '==', partnerUid),
            where('role', '==', 'sub_partner')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
            const data = d.data();
            return {
                uid: d.id,
                name: data.name || data.nickname || '이름 없음',
                email: data.email || '-',
                phone: data.phone || '-',
                ...(data.staffInfo || {})
            } as StaffData;
        });
        setStaffList(list);

        const configRef = doc(db, 'users', partnerUid, 'config', 'payroll');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            setPayrollBaseDate(configSnap.data().baseDate || 1);
        }
      } catch (e) {
        console.error("데이터 로딩 실패", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, [partnerUid]);

  // ... (핸들러 함수들 동일)
  const handleUpdateStaff = (updatedData: StaffData) => {
      setStaffList(prev => prev.map(s => s.uid === updatedData.uid ? updatedData : s));
  };

  const handleDateSettingSave = (newDate: number) => {
      setPayrollBaseDate(newDate);
      setIsDateSettingModalOpen(false);
  };

  return (
    <div className="page-container">
      <RoleHeader />
      <Header onMenuSelected={() => {}} isMobile={false} onHamburgerPressed={() => {}} />
      
      <main className="main-content" style={{padding: '40px 20px', maxWidth:'1200px', margin:'0 auto'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
            <h2 style={{fontSize:'24px', fontWeight:'bold', margin:0}}>급여/상여/정보관리</h2>
            
            {/* 상단 액션 버튼 영역 */}
            <div style={{display:'flex', gap:'10px'}}>
                <button 
                    className="btn-payroll-date"
                    onClick={() => setIsDateSettingModalOpen(true)}
                    style={{padding:'10px 16px', background:'white', border:'1px solid #ccc', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', color:'#555'}}
                >
                    📅 급여계산일 설정 (현재: {payrollBaseDate}일)
                </button>

                {/* [NEW] 상여 관리 버튼 추가 */}
                <button 
                    className="btn-bonus-manage"
                    onClick={() => setIsBonusModalOpen(true)}
                    style={{padding:'10px 16px', background:'#ff9800', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}
                >
                    🎁 상여 등록/관리
                </button>

                <button 
                    className="btn-payroll-exec"
                    onClick={() => setIsPayrollModalOpen(true)}
                    style={{padding:'10px 16px', background:'#1976d2', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}
                >
                    💰 급여 집행
                </button>
            </div>
        </div>
        
        {loading ? <div>로딩 중...</div> : (
            <div className="staff-list-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'20px'}}>
                {staffList.length === 0 ? <p>등록된 직원이 없습니다.</p> : 
                 staffList.map(staff => (
                     <div key={staff.uid} className="staff-card" style={{border:'1px solid #ddd', padding:'24px', borderRadius:'12px', background:'white', boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'15px'}}>
                             <div>
                                 <div style={{fontSize:'18px', fontWeight:'bold', color:'#333'}}>{staff.name} <span style={{fontSize:'12px', color:'#888', fontWeight:'normal'}}>{staff.employeeId ? `(${staff.employeeId})` : ''}</span></div>
                                 <div style={{color:'#666', fontSize:'13px', marginTop:'4px'}}>{staff.email}</div>
                                 <div style={{color:'#666', fontSize:'13px'}}>{staff.phone}</div>
                             </div>
                             <button 
                                onClick={() => setSelectedStaff(staff)}
                                style={{padding:'6px 12px', background:'#f5f5f5', color:'#333', border:'1px solid #ddd', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:'600'}}
                             >
                                 관리
                             </button>
                         </div>
                         <div style={{fontSize:'13px', color:'#888', borderTop:'1px dashed #eee', paddingTop:'15px', display:'flex', flexDirection:'column', gap:'4px'}}>
                             <div style={{display:'flex', justifyContent:'space-between'}}><span>입사일</span> <span>{staff.joinDate || '-'}</span></div>
                             <div style={{display:'flex', justifyContent:'space-between'}}><span>급여일</span> <span>{staff.payDate || '-'}</span></div>
                         </div>
                     </div>
                 ))
                }
            </div>
        )}
      </main>
      

      {selectedStaff && (
          <StaffDetailModal 
            staff={selectedStaff} 
            onClose={() => setSelectedStaff(null)} 
            onSave={handleUpdateStaff}
          />
      )}

      {isPayrollModalOpen && (
          <PayrollExecutionModal 
            partnerUid={partnerUid}
            staffList={staffList}
            baseDate={payrollBaseDate}
            onClose={() => setIsPayrollModalOpen(false)}
          />
      )}

      {isDateSettingModalOpen && (
          <PayrollDateSettingModal 
            partnerUid={partnerUid}
            currentBaseDate={payrollBaseDate}
            onSave={handleDateSettingSave}
            onClose={() => setIsDateSettingModalOpen(false)}
          />
      )}

      {/* [NEW] 상여 관리 모달 연결 */}
      {isBonusModalOpen && (
          <BonusManagementModal
            partnerUid={partnerUid}
            staffList={staffList}
            onClose={() => setIsBonusModalOpen(false)}
          />
      )}
    </div>
  );
};

export default StaffManagementPage;