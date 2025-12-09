import React, { useState } from 'react';
import './ShoppingMallManagementTab.css';

// 하위 컴포넌트 임포트
import ProductRegistration from './mall/ProductRegistration';
import ProductManagement from './mall/ProductManagement';
import OrderManagement from './mall/OrderManagement';
import ReturnManagement from './mall/ReturnManagement';
import SalesManagement from './mall/SalesManagement';
// [추가된 컴포넌트]
import SupplierManagement from './mall/SupplierManagement';
import CategoryManagement from './mall/CategoryManagement';

const ShoppingMallManagementTab: React.FC = () => {
  // 기본 탭 설정 (상품 등록 or 거래처 관리 등 원하는 곳으로 설정 가능)
  const [activeTab, setActiveTab] = useState('register');

  return (
    <div className="mall-mgmt-container">
      <h2>쇼핑몰 관리</h2>
      
      {/* 1. 상단 탭 버튼 영역 */}
      <div className="mall-main-tabs">
        {/* [NEW] 거래처 관리 탭 */}
        <button
          className={`mall-tab-button ${activeTab === 'supplier' ? 'active' : ''}`}
          onClick={() => setActiveTab('supplier')}
        >
          거래처 관리
        </button>

        {/* [NEW] 카테고리 관리 탭 */}
        <button
          className={`mall-tab-button ${activeTab === 'category' ? 'active' : ''}`}
          onClick={() => setActiveTab('category')}
        >
          카테고리 관리
        </button>

        <button
          className={`mall-tab-button ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          상품 등록
        </button>
        <button
          className={`mall-tab-button ${activeTab === 'manage' ? 'active' : ''}`}
          onClick={() => setActiveTab('manage')}
        >
          상품 관리
        </button>
        <button
          className={`mall-tab-button ${activeTab === 'order' ? 'active' : ''}`}
          onClick={() => setActiveTab('order')}
        >
          주문 관리
        </button>
        <button
          className={`mall-tab-button ${activeTab === 'return' ? 'active' : ''}`}
          onClick={() => setActiveTab('return')}
        >
          반품 관리
        </button>
        <button
          className={`mall-tab-button ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          매출 관리
        </button>
      </div>
      
      {/* 2. 탭 콘텐츠 렌더링 */}
      <div className="mall-tab-content">
        {activeTab === 'supplier' && <SupplierManagement />}
        {activeTab === 'category' && <CategoryManagement />}
        {activeTab === 'register' && <ProductRegistration />}
        {activeTab === 'manage' && <ProductManagement />}
        {activeTab === 'order' && <OrderManagement />}
        {activeTab === 'return' && <ReturnManagement />}
        {activeTab === 'sales' && <SalesManagement />}
      </div>
    </div>
  );
};

export default ShoppingMallManagementTab;