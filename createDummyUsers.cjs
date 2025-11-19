// createDummyUsers.js
const admin = require('firebase-admin');

// 1. 서비스 계정 키 파일 임포트
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

// 2. 생성할 더미 사용자 목록 (필요한 만큼 추가)
const dummyUsers = [
  { email: 'customer1@test.com', name: '김테스트', role: 'customer' },
  { email: 'customer2@test.com', name: '이테스트', role: 'customer' },
  { email: 'partner1@test.com', name: '박파트너', role: 'partner' },
  { email: 'partner2@test.com', name: '오파트너', role: 'partner' },
    { email: 'seller1@test.com', name: '박셀러', role: 'seller' },
      { email: 'seller2@test.com', name: '김셀러', role: 'seller' },
        { email: 'contract1@test.com', name: '백협력사', role: 'contract' },
        { email: 'contract2@test.com', name: '장협력사', role: 'contract' },
        { email: 'subadmin1@test.com', name: '고보조운영자', role: 'subadmin' },
        { email: 'subadmin2@test.com', name: '김보조운영자', role: 'subadmin' },
  // ... (여기에 100개를 넣을 수 있습니다)
];

const password = '123456'; // 모든 더미 계정의 공통 비밀번호

// 3. 사용자 생성 함수
const createUsers = async () => {
  console.log(`총 ${dummyUsers.length}개의 더미 계정 생성을 시작합니다...`);
  
  for (const userData of dummyUsers) {
    try {
      // 3-1. Firebase Authentication에 계정 생성
      const userRecord = await auth.createUser({
        email: userData.email,
        password: password,
        displayName: userData.name,
      });

      const uid = userRecord.uid;

      // 3-2. Firestore 'users' 컬렉션에 문서 생성 (UID를 문서 ID로)
      await db.collection('users').doc(uid).set({
        email: userData.email,
        name: userData.name,
        role: userData.role,
        nickname: `${userData.name}_nick`,
        phone: '010' + Math.floor(10000000 + Math.random() * 90000000).toString().slice(0, 8),
        birth: '19950101',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        nicknameLastChanged: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`(성공) ${userData.email} (UID: ${uid})`);
      
    } catch (error) {
      console.error(`(실패) ${userData.email}: ${error.message}`);
    }
  }
  console.log('더미 계정 생성 완료.');
};

createUsers();