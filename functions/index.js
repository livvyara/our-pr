// functions/index.js

const functions = require("firebase-functions/v1"); // v1 SDK
const { HttpsError } = require("firebase-functions/v1/https"); // [수정] 'httpss' -> 'https'
const logger = functions.logger; 
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

// Node.js 필수 내장 모듈
const os = require("os");
const fs = require("fs"); 
const path = require("path"); 

// 환경 변수 읽기
const config = functions.config().ncp; 

admin.initializeApp();

// ----------------------------------------------------
// --- 헬퍼 함수: Naver SENS API 호출 로직 (기존 코드) ---
// ----------------------------------------------------
async function executeSmsSend(recipientPhoneNumber, message, logContext) {
    logger.info(`[SMS 발송 시도]`, { context: logContext, recipient: recipientPhoneNumber });

    if (!recipientPhoneNumber || !message) {
        logger.error("필수 정보 누락. SMS 발송 실패.", { context: logContext });
        return; 
    }
    const serviceId = config.service_id;
    const accessKey = config.access_key;
    const secretKey = config.secret_key;
    const sender = config.sender_number;
    if (!serviceId || !accessKey || !secretKey || !sender) {
        logger.error("NCP 환경 변수가 설정되지 않았습니다. 배포 설정(functions:config:set) 확인 필요.", { context: logContext });
        return;
    }
    const messageByteLength = Buffer.byteLength(message, 'utf8');
    let messageType = messageByteLength > 100 ? "LMS" : "SMS"; 
    logger.info(`[SMS 발송 타입 결정]`, { type: messageType, bytes: messageByteLength });
    const method = "POST";
    const space = " ";
    const newLine = "\n";
    const url = `/sms/v2/services/${serviceId}/messages`;
    const timestamp = Date.now().toString();
    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(method); hmac.update(space); hmac.update(url);
    hmac.update(newLine); hmac.update(timestamp); hmac.update(newLine);
    hmac.update(accessKey);
    const signature = hmac.digest("base64");
    let formattedPhoneNumber = String(recipientPhoneNumber).replace(/-/g, "");
    const body = {
        type: messageType, contentType: "COMM", countryCode: "82",
        from: sender, content: message, messages: [{ to: formattedPhoneNumber }],
    };
    try {
        const response = await axios.post(
            `https://sens.apigw.ntruss.com/sms/v2/services/${serviceId}/messages`,
            body,
            { headers: {
                "Content-Type": "application/json; charset=utf-8",
                "x-ncp-apigw-timestamp": timestamp,
                "x-ncp-iam-access-key": accessKey,
                "x-ncp-apigw-signature-v2": signature,
            }}
        );
        if (response.data && response.data.statusCode === "202") {
            logger.info(`NCP ${messageType} sent successfully to ${recipientPhoneNumber}`);
        } else {
            logger.error(`NCP ${messageType} failed response:`, response.data);
        }
    } catch (error) {
        logger.error(`Failed to send NCP ${messageType}:`, error.response ? error.response.data : error.message);
    }
}


// ----------------------------------------------------
// 1. 휴대폰 인증번호 발송 (기존 코드)
// ----------------------------------------------------
exports.sendVerificationCode = functions
    .region("asia-northeast3") 
    .https.onCall(async (data, context) => {
    const phoneNumber = data.phoneNumber;
    if (!phoneNumber) {
        throw new HttpsError("invalid-argument", "휴대폰 번호는 필수입니다.");
    }
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 3 * 60 * 1000); 
    try {
        const docRef = admin.firestore().collection("phone_verifications").doc(phoneNumber);
        await docRef.set({ code: verificationCode, expiresAt: expiresAt });
        const message = `[아워프로젝트] 인증번호 [${verificationCode}]를 입력해주세요.`;
        await executeSmsSend(phoneNumber, message, "휴대폰 인증번호 발송");
        return { success: true, message: "인증번호가 발송되었습니다." };
    } catch (error) {
        logger.error("인증번호 발송 중 오류 발생:", error);
        throw new HttpsError("internal", "인증번호 발송에 실패했습니다.");
    }
});

// ----------------------------------------------------
// 2. 휴대폰 인증번호 확인 (기존 코드)
// ----------------------------------------------------
exports.checkVerificationCodeForSignup = functions
    .region("asia-northeast3") 
    .https.onCall(async (data, context) => {
    const { phoneNumber, code } = data;
    if (!phoneNumber || !code) {
        throw new HttpsError("invalid-argument", "휴대폰 번호와 인증번호는 필수입니다.");
    }
    try {
        const docRef = admin.firestore().collection("phone_verifications").doc(phoneNumber);
        const doc = await docRef.get();
        if (!doc.exists) { throw new HttpsError("not-found", "인증번호 요청 기록이 없습니다."); }
        const { code: storedCode, expiresAt } = doc.data();
        if (storedCode !== code) { throw new HttpsError("invalid-argument", "인증번호가 일치하지 않습니다."); }
        if (expiresAt.toMillis() < Date.now()) {
            await docRef.delete(); 
            throw new HttpsError("deadline-exceeded", "인증 시간이 만료되었습니다.");
        }
        await docRef.delete(); 
        return { success: true, message: "휴대폰 번호가 인증되었습니다." };
    } catch (error) {
        if (error instanceof HttpsError) { throw error; }
        logger.error("회원가입 인증번호 확인 중 오류 발생:", error);
        throw new HttpsError("internal", "인증 과정에서 오류가 발생했습니다.");
    }
});

// -----------------------------------------------------------------
// --- 3. [신규] 파트너 신청 승인 (기존 코드) ---
// -----------------------------------------------------------------
exports.approvePartnerApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자(admin/subadmin) 권한 확인
      if (!context.auth || !context.auth.uid) {
        throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
      }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") {
        throw new HttpsError("permission-denied", "관리자 권한이 없습니다.");
      }

      // 2. React로부터 전달받은 데이터
      const { 
        applicationId, 
        userId,        
        contactPhone,  
        applicationData 
      } = data;

      // 3. 유효성 검사 (contactPhone 누락 방지)
      if (!applicationId || !userId || !applicationData) {
        throw new HttpsError("invalid-argument", "필수 데이터(ID, 신청정보)가 누락되었습니다.");
      }
      if (!contactPhone) {
        logger.error("파트너 승인 실패: contactPhone이 비어있습니다.", data);
        throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다.");
      }
      
      const db = admin.firestore();

      try {
        // 4. [승인] 트랜잭션 (Batch Write)
        const batch = db.batch();
        const appDocRef = db.collection("partnerApplications").doc(applicationId);
        batch.update(appDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, {
          role: "partner",
          partnerInfo: {
            ...applicationData, 
            approvedByUid: context.auth.uid,
            approvedByName: adminDoc.data()?.name || "관리자",
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
        await batch.commit(); 

        // 5. [문자 발송] 승인 문자 발송
        const message = "[아워프로젝트] 파트너 심사 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "파트너 승인");
        return { success: true, message: "승인 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("파트너 승인 처리 중 오류:", error);
        throw new HttpsError("internal", "파트너 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- 4. [신규] 파트너 신청 부결 (기존 코드) ---
// -----------------------------------------------------------------
exports.rejectPartnerApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) {
        throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
      }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") {
        throw new HttpsError("permission-denied", "관리자 권한이 없습니다.");
      }

      // 2. React로부터 전달받은 데이터
      const { applicationId, contactPhone, rejectionReason } = data;

      // 3. 유효성 검사 (contactPhone 누락 방지)
      if (!applicationId || !rejectionReason) {
        throw new HttpsError("invalid-argument", "필수 데이터(ID, 부결사유)가 누락되었습니다.");
      }
      if (!contactPhone) {
        logger.error("파트너 부결 실패: contactPhone이 비어있습니다.", data);
        throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다.");
      }

      const db = admin.firestore();
      try {
        // 4. [부결] 'partnerApplications' 문서 상태 변경
        const appDocRef = db.collection("partnerApplications").doc(applicationId);
        await appDocRef.update({
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // 5. [문자 발송]
        const message = `[아워프로젝트] 심사부결 사유 : ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "파트너 부결");
        return { success: true, message: "부결 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("파트너 부결 처리 중 오류:", error);
        throw new HttpsError("internal", "파트너 부결 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 5. 추가] 파트너 정보 변경 "승인" (관리자가 호출) ---
// -----------------------------------------------------------------
exports.approveInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { 
        throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); 
      }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { 
        throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); 
      }

      // 2. 데이터 가져오기
      const { requestId, userId, newData, contactPhone } = data;
      if (!requestId || !userId || !newData || !contactPhone) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 유저ID, 새 데이터, 연락처)가 누락되었습니다.");
      }
      
      const db = admin.firestore();

      try {
        const batch = db.batch();

        // 3. 'users/{userId}'의 partnerInfo를 새 정보(newData)로 덮어쓰기
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, { partnerInfo: newData }); 

        // 4. 'partnerInfoChangeRequests/{requestId}'의 status를 'approved'로 변경
        const requestDocRef = db.collection("partnerInfoChangeRequests").doc(requestId);
        batch.update(requestDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();

        // 5. SMS 발송
        const message = "[아워프로젝트] 요청하신 정보 변경이 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "정보 변경 승인");

        return { success: true };

      } catch (error) {
        logger.error("파트너 정보 변경 승인 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 6. 추가] 파트너 정보 변경 "부결" (관리자가 호출) ---
// -----------------------------------------------------------------
exports.rejectInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { 
        throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); 
      }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { 
        throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); 
      }

      // 2. 데이터 가져오기
      const { requestId, contactPhone, rejectionReason } = data;
      if (!requestId || !contactPhone || !rejectionReason) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 연락처, 부결사유)가 누락되었습니다.");
      }
      
      const db = admin.firestore();

      try {
        // 3. 'partnerInfoChangeRequests/{requestId}'의 status를 'rejected'로 변경
        const requestDocRef = db.collection("partnerInfoChangeRequests").doc(requestId);
        await requestDocRef.update({ 
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. SMS 발송
        const message = `[아워프로젝트] 정보 변경 요청이 거부되었습니다. 사유: ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "정보 변경 부결");

        return { success: true };

      } catch (error) {
        logger.error("파트너 정보 변경 부결 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 부결 처리에 실패했습니다.");
      }
    });
    // -----------------------------------------------------------------
// --- [⭐ 7. 추가] 셀러 신청 승인 ---
// -----------------------------------------------------------------
exports.approveSellerApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 유효성 검사
      const { applicationId, userId, contactPhone, applicationData } = data;
      if (!applicationId || !userId || !applicationData) { throw new HttpsError("invalid-argument", "필수 데이터(ID, 신청정보)가 누락되었습니다."); }
      if (!contactPhone) { logger.error("셀러 승인 실패: contactPhone이 비어있습니다.", data); throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다."); }
      
      const db = admin.firestore();
      try {
        const batch = db.batch();

        // 3-1. 'sellerApplications' 문서 상태 변경
        const appDocRef = db.collection("sellerApplications").doc(applicationId);
        batch.update(appDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 3-2. 'users' 문서의 role을 'seller'로 변경
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, {
          role: "seller",
          sellerInfo: { // [수정] partnerInfo -> sellerInfo
            ...applicationData, 
            approvedByUid: context.auth.uid,
            approvedByName: adminDoc.data()?.name || "관리자",
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
        await batch.commit(); 

        // 4. [문자 발송]
        const message = "[아워프로젝트] 셀러 심사 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "셀러 승인");
        return { success: true, message: "승인 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("셀러 승인 처리 중 오류:", error);
        throw new HttpsError("internal", "셀러 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 8. 추가] 셀러 신청 부결 ---
// -----------------------------------------------------------------
exports.rejectSellerApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 유효성 검사
      const { applicationId, contactPhone, rejectionReason } = data;
      if (!applicationId || !rejectionReason) { throw new HttpsError("invalid-argument", "필수 데이터(ID, 부결사유)가 누락되었습니다."); }
      if (!contactPhone) { logger.error("셀러 부결 실패: contactPhone이 비어있습니다.", data); throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다."); }

      const db = admin.firestore();
      try {
        // 3. [부결] 'sellerApplications' 문서 상태 변경
        const appDocRef = db.collection("sellerApplications").doc(applicationId);
        await appDocRef.update({
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // 4. [문자 발송]
        const message = `[아워프로젝트] 셀러 심사부결 사유 : ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "셀러 부결");
        return { success: true, message: "부결 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("셀러 부결 처리 중 오류:", error);
        throw new HttpsError("internal", "셀러 부결 처리에 실패했습니다.");
      }
    });
    // -----------------------------------------------------------------
// --- [⭐ 9. 추가] 셀러 정보 변경 "승인" (관리자가 호출) ---
// -----------------------------------------------------------------
exports.approveSellerInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 가져오기
      const { requestId, userId, newData, contactPhone } = data;
      if (!requestId || !userId || !newData || !contactPhone) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 유저ID, 새 데이터, 연락처)가 누락되었습니다.");
      }
      
      const db = admin.firestore();
      try {
        const batch = db.batch();

        // 3. 'users/{userId}'의 sellerInfo를 새 정보(newData)로 덮어쓰기
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, { sellerInfo: newData }); 

        // 4. 'sellerInfoChangeRequests/{requestId}'의 status를 'approved'로 변경
        const requestDocRef = db.collection("sellerInfoChangeRequests").doc(requestId);
        batch.update(requestDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();

        // 5. SMS 발송
        const message = "[아워프로젝트] 요청하신 셀러 정보 변경이 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "셀러 정보 변경 승인");
        return { success: true };

      } catch (error) {
        logger.error("셀러 정보 변경 승인 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 10. 추가] 셀러 정보 변경 "부결" (관리자가 호출) ---
// -----------------------------------------------------------------
exports.rejectSellerInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 가져오기
      const { requestId, contactPhone, rejectionReason } = data;
      if (!requestId || !contactPhone || !rejectionReason) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 연락처, 부결사유)가 누락되었습니다.");
      }
      
      const db = admin.firestore();
      try {
        // 3. 'sellerInfoChangeRequests/{requestId}'의 status를 'rejected'로 변경
        const requestDocRef = db.collection("sellerInfoChangeRequests").doc(requestId);
        await requestDocRef.update({ 
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. SMS 발송
        const message = `[아워프로젝트] 셀러 정보 변경 요청이 거부되었습니다. 사유: ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "셀러 정보 변경 부결");
        return { success: true };

      } catch (error) {
        logger.error("셀러 정보 변경 부결 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 부결 처리에 실패했습니다.");
      }
    });

    // -----------------------------------------------------------------
// --- [⭐ 9. 추가] 서포터(contract) 신청 승인 ---
// -----------------------------------------------------------------
exports.approveSupporterApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 유효성 검사
      const { applicationId, userId, contactPhone, applicationData } = data;
      if (!applicationId || !userId || !applicationData) { throw new HttpsError("invalid-argument", "필수 데이터(ID, 신청정보)가 누락되었습니다."); }
      if (!contactPhone) { logger.error("서포터 승인 실패: contactPhone이 비어있습니다.", data); throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다."); }
      
      const db = admin.firestore();
      try {
        const batch = db.batch();

        // 3-1. 'supporterApplications' 문서 상태 변경
        const appDocRef = db.collection("supporterApplications").doc(applicationId);
        batch.update(appDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 3-2. 'users' 문서의 role을 'contract'로 변경
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, {
          role: "contract", // [수정]
          contractInfo: { // [수정] contractInfo
            ...applicationData, 
            approvedByUid: context.auth.uid,
            approvedByName: adminDoc.data()?.name || "관리자",
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });
        await batch.commit(); 

        // 4. [문자 발송]
        const message = "[아워프로젝트] 서포터(협력사) 심사 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "서포터 승인");
        return { success: true, message: "승인 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("서포터 승인 처리 중 오류:", error);
        throw new HttpsError("internal", "서포터 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 10. 추가] 서포터(contract) 신청 부결 ---
// -----------------------------------------------------------------
exports.rejectSupporterApplication = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 유효성 검사
      const { applicationId, contactPhone, rejectionReason } = data;
      if (!applicationId || !rejectionReason) { throw new HttpsError("invalid-argument", "필수 데이터(ID, 부결사유)가 누락되었습니다."); }
      if (!contactPhone) { logger.error("서포터 부결 실패: contactPhone이 비어있습니다.", data); throw new HttpsError("invalid-argument", "문자를 발송할 연락처 정보가 없습니다."); }

      const db = admin.firestore();
      try {
        // 3. [부결] 'supporterApplications' 문서 상태 변경
        const appDocRef = db.collection("supporterApplications").doc(applicationId);
        await appDocRef.update({
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // 4. [문자 발송]
        const message = `[아워프로젝트] 서포터(협력사) 심사부결 사유 : ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "서포터 부결");
        return { success: true, message: "부결 처리 및 문자 발송 완료" };

      } catch (error) {
        logger.error("서포터 부결 처리 중 오류:", error);
        throw new HttpsError("internal", "서포터 부결 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 11. 수정] 서포터 정보 변경 "승인" (3단계) ---
// -----------------------------------------------------------------
exports.approveSupporterInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 가져오기
      const { requestId, userId, newData, contactPhone } = data;
      if (!requestId || !userId || !newData || !contactPhone) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 유저ID, 새 데이터, 연락처)가 누락되었습니다.");
      }
      
      const db = admin.firestore();

      try {
        const batch = db.batch();

        // 3. 'users/{userId}'의 contractInfo를 새 정보(newData)로 덮어쓰기
        const userDocRef = db.collection("users").doc(userId);
        batch.update(userDocRef, { contractInfo: newData }); // [수정]

        // 4. 'supporterInfoChangeRequests/{requestId}'의 status를 'approved'로 변경
        const requestDocRef = db.collection("supporterInfoChangeRequests").doc(requestId); // [수정]
        batch.update(requestDocRef, { 
          status: "approved",
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();

        // 5. SMS 발송
        const message = "[아워프로젝트] 요청하신 서포터(협력사) 정보 변경이 승인되었습니다.";
        await executeSmsSend(contactPhone, message, "서포터 정보 변경 승인");

        return { success: true };

      } catch (error) {
        logger.error("서포터 정보 변경 승인 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 승인 처리에 실패했습니다.");
      }
    });

// -----------------------------------------------------------------
// --- [⭐ 12. 수정] 서포터 정보 변경 "부결" (3단계) ---
// -----------------------------------------------------------------
exports.rejectSupporterInfoChange = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
      // 1. 관리자 권한 확인
      if (!context.auth || !context.auth.uid) { throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다."); }
      const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      const adminRole = adminDoc.data() ? adminDoc.data().role : null;
      if (adminRole !== "admin" && adminRole !== "subadmin") { throw new HttpsError("permission-denied", "관리자 권한이 없습니다."); }

      // 2. 데이터 가져오기
      const { requestId, contactPhone, rejectionReason } = data;
      if (!requestId || !contactPhone || !rejectionReason) {
        throw new HttpsError("invalid-argument", "필수 데이터(요청ID, 연락처, 부결사유)가 누락되었습니다.");
      }
      
      const db = admin.firestore();

      try {
        // 3. 'supporterInfoChangeRequests/{requestId}'의 status를 'rejected'로 변경
        const requestDocRef = db.collection("supporterInfoChangeRequests").doc(requestId); // [수정]
        await requestDocRef.update({ 
          status: "rejected",
          rejectionReason: rejectionReason,
          processedByUid: context.auth.uid,
          processedByName: adminDoc.data()?.name || "관리자",
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. SMS 발송
        const message = `[아워프로젝트] 서포터(협력사) 정보 변경 요청이 거부되었습니다. 사유: ${rejectionReason}`;
        await executeSmsSend(contactPhone, message, "서포터 정보 변경 부결");

        return { success: true };

      } catch (error) {
        logger.error("서포터 정보 변경 부결 중 오류:", error);
        throw new HttpsError("internal", "정보 변경 부결 처리에 실패했습니다.");
      }
    });
// -----------------------------------------------------------------
// --- [⭐ 14. 수정] 로그인 차단 함수 (Custom Claims 방식으로 변경) ---
// -----------------------------------------------------------------
exports.beforeUserSignIn = functions
    .region("asia-northeast3")
    .auth.user()
    .beforeSignIn(async (user, context) => {
        
        const db = admin.firestore();
        const userDocRef = db.collection("users").doc(user.uid);
        
        try {
            const userDoc = await userDocRef.get();
            if (!userDoc.exists) {
                logger.warn(`로그인 시도: Firestore에 유저 문서가 없습니다. (UID: ${user.uid})`);
                return; // 로그인 허용
            }

            const userData = userDoc.data();
            const currentClaims = user.customClaims || {}; // 기존 클레임

            // 1. 금지 날짜 필드 확인
            if (userData && userData.isBannedUntil) {
                const banExpiryDate = userData.isBannedUntil.toDate();
                const now = new Date(); 

                if (now < banExpiryDate) {
                    // [⭐ 1. 핵심] 아직 금지 기간임
                    // 오류를 던지는 대신, 토큰에 "금지 정보" 클레임을 추가합니다.
                    
                    const expiryStringKST = banExpiryDate.toLocaleString("ko-KR", { 
                        timeZone: "Asia/Seoul",
                        year: 'numeric', month: 'long', day: 'numeric', 
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        hour12: false 
                    });
                    
                    // (프론트엔드로 전달할 메시지)
                    const banMessage = `${expiryStringKST}까지 로그인이 금지된 사용자 입니다.`;

                    // [⭐ 2. 클레임 설정]
                    await admin.auth().setCustomUserClaims(user.uid, { 
                        ...currentClaims, // 기존 클레임 유지
                        bannedUntil: banMessage // [중요] 금지 메시지를 클레임에 추가
                    });
                    return; // 로그인 자체는 성공시킴

                } else {
                    // [⭐ 3. 핵심] 금지 기간 만료됨
                    // 사용자가 로그인했으므로, 만료된 'bannedUntil' 클레임을 제거해줍니다.
                    if (currentClaims.bannedUntil) {
                        const { bannedUntil, ...otherClaims } = currentClaims;
                        await admin.auth().setCustomUserClaims(user.uid, otherClaims);
                    }
                    return; // 로그인 허용
                }
            } 
            
            // 2. 금지 필드가 없는데 클레임이 남아있는 경우 (정리)
            if (currentClaims.bannedUntil) {
                 const { bannedUntil, ...otherClaims } = currentClaims;
                 await admin.auth().setCustomUserClaims(user.uid, otherClaims);
            }
            
            // 금지 대상이 아니면 로그인 허용
            return;

        } catch (error) {
            logger.error(`로그인 클레임 설정 중 오류 (UID: ${user.uid}):`, error);
            // [중요] 이 함수 자체가 실패하면 로그인이 막힙니다.
            throw new functions.https.HttpsError("internal", "로그인 처리 중 서버 오류가 발생했습니다.");
        }
    });
    exports.logAdminActivity = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // 1. 권한 확인
        if (!context.auth || !context.auth.uid) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        const adminDocRef = admin.firestore().collection("users").doc(context.auth.uid);
        const adminDoc = await adminDocRef.get();
        const userRole = adminDoc.data() ? adminDoc.data().role : null;
        
        // [⭐ 수정] partner 역할도 로그 기록 허용
        if (userRole !== "admin" && userRole !== "subadmin" && userRole !== "partner") {
            throw new HttpsError("permission-denied", "로그를 기록할 권한이 없습니다.");
        }

        // 2. 로그 메시지 데이터 가져오기
        const { message } = data;
        if (!message) {
            throw new HttpsError("invalid-argument", "로그 메시지가 없습니다.");
        }
        
        const userNickname = adminDoc.data()?.nickname || "사용자";

        // 3. 'adminActivityLogs' 컬렉션에 로그 저장
        try {
            await admin.firestore().collection("adminActivityLogs").add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                adminUid: context.auth.uid,
                adminNickname: userNickname, // [수정] 변수명 의미에 맞게 (관리자 or 파트너)
                message: message,
                role: userRole // (선택사항: 누가 기록했는지 역할도 저장하면 좋음)
            });
            return { success: true };
        } catch (error) {
            logger.error("활동 로그 기록 실패:", error);
            throw new HttpsError("internal", "로그 저장에 실패했습니다.");
        }
    });
    // -----------------------------------------------------------------
// --- [⭐ 16. 추가] 마케팅 SMS 단체 발송 ---
// -----------------------------------------------------------------
exports.sendMarketingSms = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // 1. 관리자 권한 확인
        if (!context.auth || !context.auth.uid) {
            throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
        }
        const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
        const adminRole = adminDoc.data() ? adminDoc.data().role : null;
        if (adminRole !== "admin" && adminRole !== "subadmin") {
            throw new HttpsError("permission-denied", "관리자 권한이 없습니다.");
        }

        // 2. 데이터 가져오기
        const { message } = data;
        if (!message) {
            throw new HttpsError("invalid-argument", "메시지 내용이 없습니다.");
        }

        const db = admin.firestore();
        let sentCount = 0;

        try {
            // 3. 마케팅 동의 회원 조회
            const usersRef = db.collection("users");
            const q = query(usersRef, where("agreedMarketing", "==", true));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                return { success: true, sentCount: 0, message: "발송 대상이 0명입니다." };
            }

            // 4. (비동기) SMS 발송 (NCP SENS는 병렬 요청이 가능)
            const sendPromises = [];
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData.phone) {
                    // executeSmsSend는 내부적으로 try/catch가 있으므로 await 안 함
                    sendPromises.push(
                        executeSmsSend(userData.phone, message, "마케팅 단체 발송")
                    );
                    sentCount++;
                }
            });
            
            // 모든 SMS 요청이 (성공하든 실패하든) 완료될 때까지 기다림
            await Promise.all(sendPromises);

            // 5. 발송 결과 로그 기록
            await db.collection("dispatchLogs").add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                adminUid: context.auth.uid,
                adminNickname: adminDoc.data()?.nickname || "관리자",
                type: "Marketing SMS",
                message: message,
                recipientCount: sentCount
            });

            return { success: true, sentCount: sentCount };

        } catch (error) {
            logger.error("마케팅 SMS 발송 중 오류:", error);
            throw new HttpsError("internal", "단체 문자 발송 중 서버 오류가 발생했습니다.");
        }
    });

// -----------------------------------------------------------------
// --- [⭐ 17. 추가] 특정 회원 SMS 발송 ---
// -----------------------------------------------------------------
exports.sendDirectSms = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // 1. 관리자 권한 확인
        if (!context.auth || !context.auth.uid) {
            throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
        }
        const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
        const adminRole = adminDoc.data() ? adminDoc.data().role : null;
        if (adminRole !== "admin" && adminRole !== "subadmin") {
            throw new HttpsError("permission-denied", "관리자 권한이 없습니다.");
        }

        // 2. 데이터 가져오기
        const { message, targetUid } = data;
        if (!message || !targetUid) {
            throw new HttpsError("invalid-argument", "메시지 또는 대상 UID가 없습니다.");
        }

        const db = admin.firestore();
        try {
            // 3. 대상 회원 정보 조회
            const targetUserDoc = await db.collection("users").doc(targetUid).get();
            if (!targetUserDoc.exists) {
                throw new HttpsError("not-found", "대상 회원을 찾을 수 없습니다.");
            }
            const targetPhone = targetUserDoc.data()?.phone;
            if (!targetPhone) {
                throw new HttpsError("invalid-argument", "대상 회원의 휴대폰 번호가 없습니다.");
            }

            // 4. SMS 발송
            await executeSmsSend(targetPhone, message, "특정 회원 발송");
            
            // 5. 발송 결과 로그 기록
            await db.collection("dispatchLogs").add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                adminUid: context.auth.uid,
                adminNickname: adminDoc.data()?.nickname || "관리자",
                type: "Direct SMS",
                message: message,
                recipientCount: 1,
                targetInfo: { // (참고용)
                    uid: targetUid,
                    nickname: targetUserDoc.data()?.nickname,
                    phone: targetPhone
                }
            });

            return { success: true };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error("특정 SMS 발송 중 오류:", error);
            throw new HttpsError("internal", "특정 문자 발송 중 서버 오류가 발생했습니다.");
        }
    });

// -----------------------------------------------------------------
// --- [⭐ 18. 추가] 앱 푸시 알림 발송 (FCM) ---
// -----------------------------------------------------------------
exports.sendPushNotification = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // 1. 관리자 권한 확인
        if (!context.auth || !context.auth.uid) {
            throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
        }
        const adminDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
        const adminRole = adminDoc.data() ? adminDoc.data().role : null;
        if (adminRole !== "admin" && adminRole !== "subadmin") {
            throw new HttpsError("permission-denied", "관리자 권한이 없습니다.");
        }

        // 2. 데이터 가져오기
        const { title, body } = data;
        if (!title || !body) {
            throw new HttpsError("invalid-argument", "푸시 제목과 내용이 없습니다.");
        }

        const db = admin.firestore();
        let sentCount = 0;
        
        try {
            // 3. 알림 동의 회원 + FCM 토큰이 있는 회원 조회
            // (참고: 이 쿼리는 'users' 컬렉션에 agreedNotifications 필드가 있어야 합니다)
            const usersRef = db.collection("users");
            const q = query(usersRef, where("agreedNotifications", "==", true));
            const usersSnapshot = await getDocs(q);

            if (usersSnapshot.empty) {
                return { success: true, sentCount: 0, message: "발송 대상이 0명입니다." };
            }

            const fcmTokens = [];
            // (FCM 토큰을 users/{uid}/fcmTokens/{tokenId} 에 저장했다고 가정)
            for (const userDoc of usersSnapshot.docs) {
                const tokensSnapshot = await db.collection("users").doc(userDoc.id).collection("fcmTokens").get();
                if (!tokensSnapshot.empty) {
                    tokensSnapshot.forEach(tokenDoc => {
                        fcmTokens.push(tokenDoc.id); // (토큰 ID가 실제 토큰이라고 가정)
                    });
                }
            }
            
            if (fcmTokens.length === 0) {
                return { success: true, sentCount: 0, message: "알림에 동의한 회원이 있으나, 앱 설치(토큰) 기록이 없습니다." };
            }

            // 4. FCM 메시지 발송
            // (토큰 500개 단위로 분할 발송 - sendMulticast)
            const messagePayload = {
                notification: {
                    title: title,
                    body: body,
                },
                // (선택) 데이터 페이로드 (예: 앱에서 특정 페이지로 이동)
                // data: {
                //   click_action: "FLUTTER_NOTIFICATION_CLICK",
                //   screen: "/notifications"
                // }
            };

            // (500개씩 나눠서 전송)
            const tokenBatches = [];
            for (let i = 0; i < fcmTokens.length; i += 500) {
                const batch = fcmTokens.slice(i, i + 500);
                tokenBatches.push(batch);
            }
            
            for (const batch of tokenBatches) {
                 const response = await admin.messaging().sendToDevice(batch, messagePayload);
                 sentCount += response.successCount;
                 // (오류 로깅은 생략, 필요시 response.failureCount 확인)
            }

            // 5. 발송 결과 로그 기록
            await db.collection("dispatchLogs").add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                adminUid: context.auth.uid,
                adminNickname: adminDoc.data()?.nickname || "관리자",
                type: "Push Notification",
                message: `[${title}] ${body}`,
                recipientCount: sentCount
            });

            return { success: true, sentCount: sentCount };

        } catch (error) {
            logger.error("푸시 알림 발송 중 오류:", error);
            throw new HttpsError("internal", "푸시 알림 발송 중 서버 오류가 발생했습니다.");
        }
    });
// -----------------------------------------------------------------
// --- [⭐ 19. 수정] 파트너 직원을 위한 초대 코드 생성 ---
// -----------------------------------------------------------------
exports.createCompanyInvitation = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // ... (1. 권한 확인 로직은 동일) ...
        if (!context.auth || !context.auth.uid) { /* ... */ }
        const adminDocRef = admin.firestore().collection("users").doc(context.auth.uid);
        const adminDoc = await adminDocRef.get();
        const adminRole = adminDoc.data()?.role;
        if (adminRole !== "partner") { /* ... */ }

        // 2. 파트너 정보 가져오기 (초대장에 저장)
        const partnerInfo = adminDoc.data()?.partnerInfo;
        if (!partnerInfo || !partnerInfo.businessNumber) { /* ... */ }

        try {
            // [⭐ 1. 수정] 복사할 partnerInfo 객체 "정제"
            const partnerInfoToCopy = {
                companyName: partnerInfo.companyName || "회사명 없음",
                businessNumber: partnerInfo.businessNumber,
                ceoName: partnerInfo.ceoName || "",
                city: partnerInfo.city || "",
                district: partnerInfo.district || "",
                addressDetail: partnerInfo.addressDetail || "",
                
                // [⭐ 2. 핵심 추가] 직원이 대표의 UID를 알 수 있도록 ownerUid를 추가
                ownerUid: context.auth.uid 
            };

            // 3. 'companyInvitations' 컬렉션에 초대장 문서 생성
            const invitationRef = admin.firestore().collection("companyInvitations").doc();
            
            await invitationRef.set({
                partnerUid: context.auth.uid, 
                companyName: partnerInfo.companyName || "회사명 없음",
                businessNumber: partnerInfo.businessNumber,
                partnerInfoToCopy: partnerInfoToCopy, // [⭐ 3. 수정] ownerUid가 포함된 정제 객체를 저장
                status: "pending", 
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // ... (return은 동일) ...
            return { success: true, inviteId: invitationRef.id };

        } catch (error) {
            logger.error("초대 코드 생성 실패:", error);
            throw new HttpsError("internal", "초대 코드 생성 실패: 저장할 데이터에 오류가 있습니다.");
        }
    });
// -----------------------------------------------------------------
// --- [⭐ 20. 수정] 직원이 초대 코드를 수락 (회사명 반환 추가) ---
// -----------------------------------------------------------------
exports.redeemCompanyInvitation = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        if (!context.auth || !context.auth.uid) {
            throw new HttpsError("unauthenticated", "초대를 수락하려면 로그인이 필요합니다.");
        }
        
        const { inviteId } = data;
        if (!inviteId) {
            throw new HttpsError("invalid-argument", "초대 코드가 없습니다.");
        }

        const db = admin.firestore();
        const employeeUid = context.auth.uid; 
        
        try {
            // [⭐ 변수 선언] 트랜잭션 밖에서 회사명을 저장할 변수
            let companyName = "";

            await db.runTransaction(async (transaction) => {
                // (1) 초대장 읽기
                const inviteRef = db.collection("companyInvitations").doc(inviteId);
                const inviteDoc = await transaction.get(inviteRef);

                if (!inviteDoc.exists) {
                    throw new HttpsError("not-found", "유효하지 않은 초대 코드입니다.");
                }
                if (inviteDoc.data().status !== "pending") {
                    throw new HttpsError("already-exists", "이미 사용된 초대 코드입니다.");
                }

                // (2) 사용자 읽기
                const employeeDocRef = db.collection("users").doc(employeeUid);
                const employeeSnap = await transaction.get(employeeDocRef);
                
                if (!employeeSnap.exists) {
                     throw new HttpsError("not-found", "사용자(직원) 계정 정보를 찾을 수 없습니다.");
                }

                const inviteData = inviteDoc.data();
                // [⭐ 저장] 반환할 회사명 추출
                companyName = inviteData.companyName || "파트너사"; 

                // (3) 사용자 업데이트
                transaction.update(employeeDocRef, { 
                    role: "sub_partner",
                    partnerInfo: inviteData.partnerInfoToCopy, 
                    partnerPermissions: [] 
                });
                
                // (4) 초대장 상태 변경
                transaction.update(inviteRef, {
                    status: "redeemed", 
                    redeemedByUid: employeeUid,
                    redeemedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            logger.info(`[초대 수락 성공] UID: ${employeeUid}`);

            // [⭐ 수정] 회사명을 클라이언트로 반환
            return { success: true, companyName: companyName };

        } catch (error) {
            logger.error(`초대 수락 실패 (UID: ${employeeUid}, Code: ${inviteId}):`, error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", `초대 수락 실패: ${error.message}`);
        }
    });
// -----------------------------------------------------------------
// --- [⭐ 21. 수정] 직원 삭제 (로그 기록 오류 방지) ---
// -----------------------------------------------------------------
exports.deleteSubPartner = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // ... (1. 파트너(대표) 권한 확인) ...
        if (!context.auth || !context.auth.uid) { /* ... */ }
        const partnerUid = context.auth.uid;
        // ... (권한 확인) ...

        // ... (2. 삭제할 직원 UID 가져오기) ...
        const { employeeUid } = data;
        if (!employeeUid) { /* ... */ }

        const db = admin.firestore();
        try {
            // ... (3. 직원 정보 조회 및 소속 확인) ...
            const employeeDocRef = db.collection("users").doc(employeeUid);
            const employeeDoc = await employeeDocRef.get();
            if (!employeeDoc.exists) { /* ... */ }
            const employeeInfo = employeeDoc.data().partnerInfo;
            if (employeeInfo?.ownerUid !== partnerUid) { /* ... */ }

            // 4. 직원의 role을 'customer'로 강등, 소속 정보 제거
            await employeeDocRef.update({
                role: "customer",
                partnerInfo: admin.firestore.FieldValue.delete(),
                partnerPermissions: admin.firestore.FieldValue.delete()
            });

            // [⭐ 3. 핵심 수정] 활동 로그 기록을 "시도"하되, 실패해도 메인 기능은 성공으로 처리
            try {
                const targetUserName = employeeDoc.data()?.nickname || employeeDoc.data()?.name || employeeUid;
                await logActivity({
                    message: `[직원 관리] [${targetUserName}]님을 직원 목록에서 삭제(역할 회수)했습니다.`
                });
            } catch (logError) {
                logger.error("직원 삭제 성공했으나, 로그 기록 실패:", logError);
                // 로그 기록이 실패해도 직원은 삭제되었으므로 오류를 반환(throw)하지 않음
            }

            return { success: true, message: "직원 정보가 삭제되었습니다." };

        } catch (error) {
            logger.error(`직원 삭제 실패 (대표: ${partnerUid}, 직원: ${employeeUid}):`, error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", "직원 삭제 처리에 실패했습니다.");
        }
    });

// -----------------------------------------------------------------
// --- [⭐ 추가] 도급인(현장) 초대 링크 생성 ---
// -----------------------------------------------------------------
exports.createSiteInvitation = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        // 1. 로그인 및 권한 확인
        if (!context.auth || !context.auth.uid) {
            throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { siteId, siteName, partnerUid } = data;
        if (!siteId || !partnerUid) {
            throw new functions.https.HttpsError("invalid-argument", "현장 정보가 누락되었습니다.");
        }

        // (선택) 요청자가 해당 현장의 주인(파트너)이거나 권한이 있는지 확인하는 로직을 추가할 수 있습니다.
        // 여기서는 간단히 진행합니다.

        try {
            const db = admin.firestore();

            // 2. 'siteInvitations' 컬렉션에 초대장 생성
            // (직원 초대와 달리, 특정 '현장(siteId)'에 대한 권한을 주는 초대장입니다)
            const invitationRef = db.collection("siteInvitations").doc();

            await invitationRef.set({
                type: "contractor", // 도급인 초대
                siteId: siteId,
                siteName: siteName || "현장",
                partnerUid: partnerUid, // 현장 소유자
                inviterUid: context.auth.uid, // 초대한 사람
                status: "pending", // 대기중
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000) // 예: 7일 후 만료
            });

            return { success: true, inviteId: invitationRef.id };

        } catch (error) {
            console.error("도급인 초대 생성 실패:", error);
            throw new functions.https.HttpsError("internal", "초대 링크 생성 중 오류가 발생했습니다.");
        }
    });


// -----------------------------------------------------------------
// --- [⭐ 추가] 도급인 초대 문자 발송 (전화번호 직접 발송) ---
// -----------------------------------------------------------------
// 기존 sendDirectSms는 targetUid(회원)가 필요했지만, 
// 도급인은 아직 회원이 아닐 수 있으므로 전화번호로 직접 보내야 합니다.
exports.sendContractorInviteSms = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {

        // 1. 권한 확인 (파트너/서브파트너만 발송 가능)
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { phone, message, siteName } = data;
        if (!phone || !message) {
            throw new functions.https.HttpsError("invalid-argument", "전화번호와 내용이 필요합니다.");
        }

        const db = admin.firestore();

        try {
            // 2. SMS 발송 (기존에 사용하시던 executeSmsSend 함수 재사용)
            // (주의: index.js 내부에 executeSmsSend 함수가 정의되어 있어야 합니다.)
            await executeSmsSend(phone, message, `도급인 초대(${siteName})`);

            // 3. 발송 로그 기록
            await db.collection("dispatchLogs").add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                senderUid: context.auth.uid,
                type: "Contractor Invite SMS",
                targetPhone: phone,
                message: message,
                success: true
            });

            return { success: true };

        } catch (error) {
            console.error("도급인 문자 발송 실패:", error);
            throw new functions.https.HttpsError("internal", "문자 발송에 실패했습니다.");
        }
    });

    // -----------------------------------------------------------------
// --- [⭐ 추가] 도급인 초대 수락 (현장 권한 부여) ---
// -----------------------------------------------------------------
exports.redeemSiteInvitation = functions
    .region("asia-northeast3")
    .https.onCall(async (data, context) => {
        
        if (!context.auth || !context.auth.uid) {
            throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { inviteId } = data;
        const userUid = context.auth.uid;
        const db = admin.firestore();

        try {
            let siteName = "";
            let siteId = "";

            await db.runTransaction(async (t) => {
                // 1. 초대장 조회
                const inviteRef = db.collection("siteInvitations").doc(inviteId);
                const inviteSnap = await t.get(inviteRef);

                if (!inviteSnap.exists) {
                    throw new functions.https.HttpsError("not-found", "초대장을 찾을 수 없습니다.");
                }
                
                const inviteData = inviteSnap.data();
                if (inviteData.status !== "pending") {
                    throw new functions.https.HttpsError("already-exists", "이미 완료된 초대입니다.");
                }

                // 본인이 본인을 초대한 경우 (테스트 등) 허용할지 여부 결정
                // if (inviteData.inviterUid === userUid) ...

                siteId = inviteData.siteId;
                siteName = inviteData.siteName;
                const partnerUid = inviteData.partnerUid;

                // 2. 권한 부여 (방법 A: users/{uid}/sharedSites 컬렉션에 추가)
                // 이 방법은 사용자가 "공유받은 현장" 목록을 조회하기 쉽습니다.
                const sharedSiteRef = db.collection("users").doc(userUid).collection("sharedSites").doc(siteId);
                
                t.set(sharedSiteRef, {
                    siteId: siteId,
                    siteName: siteName,
                    partnerUid: partnerUid, // 원주인
                    role: "contractor", // 역할 (도급인)
                    joinedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // (옵션: 현장 문서에도 참여자 목록 업데이트 가능)
                
                // 3. 초대장 상태 업데이트 (재사용 방지)
                t.update(inviteRef, {
                    status: "redeemed",
                    redeemedBy: userUid,
                    redeemedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            return { success: true, siteName, siteId };

        } catch (error) {
            console.error("도급인 초대 수락 실패:", error);
            throw new functions.https.HttpsError("internal", "초대 수락 중 오류가 발생했습니다.");
        }
    });
 // -----------------------------------------------------------------
// --- [⭐ 홈택스 실제 스크래핑 함수 (현금영수증 기능 추가됨)] ---
// -----------------------------------------------------------------
if (!admin.apps.length) {
    admin.initializeApp();
}

exports.scrapHometaxData = functions
    .region("asia-northeast3")
    .runWith({
        timeoutSeconds: 300, // 5분 (현금영수증 4분기 조회 시 시간 필요)
        memory: "2GB"
    })
    .https.onCall(async (data, context) => {
        
        // 1. 환경 설정 및 라이브러리 로드
        process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
        const { chromium } = require('playwright-chromium');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const admin = require('firebase-admin');
        const db = admin.firestore();

        // 2. 권한 확인
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 프론트엔드 데이터
        const { certPassword, certFileDer, certFileKey } = data;
        
        // 임시 파일 경로
        const tempDir = os.tmpdir();
        const derPath = path.join(tempDir, `signCert_${context.auth.uid}.der`);
        const keyPath = path.join(tempDir, `signPri_${context.auth.uid}.key`);

        let browser = null;
        let page = null;

        try {
            // 3. 인증서 파일 생성
            if (certFileDer && certFileKey) {
                fs.writeFileSync(derPath, Buffer.from(certFileDer, 'base64'));
                fs.writeFileSync(keyPath, Buffer.from(certFileKey, 'base64'));
                console.log("인증서 파일 임시 생성 완료");
            } else {
                throw new Error("인증서 파일 데이터가 누락되었습니다.");
            }

            console.log("브라우저 실행 중...");
            browser = await chromium.launch({ 
                headless: true, 
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--single-process',
                    '--window-size=1920,1080'
                ]
            });
            
            const browserContext = await browser.newContext({ 
                viewport: { width: 1920, height: 1080 }, 
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            page = await browserContext.newPage();

            // 4. 홈택스 메인 접속
            console.log("STEP 1: 홈택스 메인 접속 시도");
            await page.goto('https://www.hometax.go.kr', { waitUntil: 'networkidle', timeout: 60000 });
            
            // 리다이렉트 체크
            if (page.url().includes('security') || page.url().includes('install')) {
                throw new Error("보안 프로그램 설치 페이지로 이동되었습니다.");
            }
            
            await page.waitForTimeout(3000);

            // [⭐ 추가] 혹시 팝업이 떠서 가렸을 수 있으니 닫기 시도 (선택사항)
            // (홈택스는 메인에 공지 팝업이 많음)
            const closePopups = page.locator('.w2window_close'); 
            if (await closePopups.count() > 0) {
                console.log("   메인 팝업 닫기 시도...");
                // 모든 닫기 버튼 클릭 (위험할 수 있으니 try-catch로 감쌈)
                try {
                    const buttons = await closePopups.all();
                    for (const btn of buttons) {
                        if (await btn.isVisible()) await btn.click();
                    }
                } catch(e) {}
            }


            // 5. [공동·금융인증서] 버튼 클릭
            console.log("STEP 2: [공동·금융인증서] 버튼 탐색 및 클릭");
            
            // [⭐ 수정] waitForSelector를 사용하여 버튼이 나타날 때까지 기다림 (최대 10초)
            // 텍스트보다는 ID가 확실하므로 ID 우선 사용
            const certBtnSelector = '#mf_txppWframe_loginboxFrame_anchor22'; 
            const loginBtnSelector = '#mf_wfHeader_group1503'; // 상단 로그인 버튼

            try {
                // 메인 화면의 '공동인증서' 버튼 기다리기
                const certBtn = page.locator(certBtnSelector).or(page.locator('text=공동·금융인증서')).first();
                await certBtn.waitFor({ state: 'visible', timeout: 10000 });
                
                console.log("   메인 화면에서 버튼 발견! 클릭합니다.");
                await certBtn.click();

            } catch (e) {
                console.log("   메인에 버튼 없음. 상단 [로그인] 버튼 클릭 시도...");
                
                // 상단 로그인 버튼 기다리기
                const topLoginBtn = page.locator(loginBtnSelector).or(page.getByText('로그인')).first();
                
                if (await topLoginBtn.isVisible()) {
                    await topLoginBtn.click();
                    await page.waitForTimeout(3000); // 로그인 페이지 이동 대기
                    
                    // 이동 후 다시 버튼 찾기
                    console.log("   로그인 페이지 이동 후 버튼 재탐색...");
                    const certBtnRetry = page.locator('text=공동·금융인증서').first();
                    await certBtnRetry.waitFor({ state: 'visible', timeout: 10000 });
                    await certBtnRetry.click();
                } else {
                    // [⭐ 중요] 버튼을 못 찾았을 때 화면을 캡처해서 저장 (에러 메시지에 포함)
                    const buffer = await page.screenshot({ fullPage: true });
                    screenshotBase64 = buffer.toString('base64');
                    throw new Error("상단 '로그인' 버튼도 찾을 수 없습니다. (스크린샷 확인 필요)");
                }
            }
            
            console.log("   팝업 대기 중...");
            await page.waitForTimeout(4000); // 팝업(iframe) 뜨는 시간 대기


            // 6. 인증서 팝업(iframe) 탐색 및 제어
            console.log("STEP 3: 인증서 선택창(iframe) 탐색");
            
            let targetFrame = null;
            const frames = page.frames();
            
            // 모든 프레임을 순회하며 '인증서 찾기(#in_browser)' 버튼이 있는 프레임을 찾음
            for (const frame of frames) {
                try {
                    if (await frame.locator('#in_browser').count() > 0) {
                        targetFrame = frame;
                        console.log(`   ✅ 인증서 팝업 프레임 발견: ${frame.url()}`);
                        break;
                    }
                } catch (e) {
                    // 접근 불가능한 프레임은 무시
                }
            }

            // iframe이 아니라 메인 페이지에 레이어로 떴을 경우 확인
            if (!targetFrame) {
                if (await page.locator('#in_browser').count() > 0) {
                    targetFrame = page;
                    console.log("   ✅ 메인 프레임 내 레이어 팝업 발견");
                }
            }

            // 팝업을 찾지 못한 경우: 스크린샷 찍고 종료
            if (!targetFrame) {
                console.log("❌ 인증서 팝업을 찾을 수 없습니다. 현재 화면을 캡처합니다.");
                const buffer = await page.screenshot({ fullPage: false });
                screenshotBase64 = buffer.toString('base64');
                return { 
                    success: false, 
                    screenshot: screenshotBase64, 
                    message: "인증서 선택창(팝업)을 찾을 수 없습니다. 스크린샷을 확인하세요." 
                };
            }


           // ============================================================
            // 7. 파일 업로드 (수정: 2단계 팝업 구조 완벽 대응)
            // ============================================================
            console.log("STEP 4: 인증서 파일 주입 (인증서 찾기 -> 등록 팝업 진입)");
            
            // [1단계] 첫 번째 팝업(#ML_window)에서 '인증서 찾기' 버튼 클릭
            try {
                // 버튼이 상호작용 가능할 때까지 대기
                const findBtn = targetFrame.locator('#in_browser');
                await findBtn.waitFor({ state: 'visible', timeout: 10000 });
                
                console.log("   [1/3] '인증서 찾기(#in_browser)' 버튼 클릭");
                await findBtn.click();
                
            } catch (e) {
                throw new Error(`'인증서 찾기' 버튼을 클릭할 수 없습니다: ${e.message}`);
            }

            // [2단계] 두 번째 팝업(#ML_Dialog_common)이 뜰 때까지 대기
            // 클릭 후 화면에 새로운 레이어가 그려질 시간을 줘야 합니다.
            console.log("   [2/3] '브라우저인증서 등록하기' 팝업 대기 중...");
            await page.waitForTimeout(2000); // 애니메이션 대기

            try {
                // 제공해주신 HTML의 두 번째 팝업 ID(#ML_Dialog_common)가 보일 때까지 대기
                const registerPopup = targetFrame.locator('#ML_Dialog_common');
                await registerPopup.waitFor({ state: 'visible', timeout: 10000 });
                console.log("   ✅ 등록 팝업(#ML_Dialog_common) 확인됨");

                // [3단계] 파일 주입 (#filefile2)
                // 팝업 내의 파일 입력창 찾기
                const fileInput = targetFrame.locator('#filefile2');
                await fileInput.waitFor({ state: 'attached', timeout: 5000 });

                console.log("   [3/3] 파일 입력창(#filefile2)에 인증서 주입 시도");
                await fileInput.setInputFiles([derPath, keyPath]);
                console.log("   ✅ 파일 주입 완료");

                // 파일 처리 시간 대기 (파일이 들어가야 비밀번호창이 활성화됨)
                await page.waitForTimeout(1500);

            } catch (e) {
                // 만약 #filefile2를 못 찾으면 비상 대책으로 type="file"을 찾음
                console.warn("   ID로 찾기 실패, 범용 검색 시도...");
                try {
                    await targetFrame.locator('input[type="file"]').first().setInputFiles([derPath, keyPath]);
                    console.log("   ✅ 범용 입력창에 파일 주입 성공");
                } catch(fatalError) {
                    throw new Error(`파일 주입 실패: ${fatalError.message}`);
                }
            }
// ============================================================
            // [수정] 알림창(Alert) 감지 리스너 등록 (실패 원인 파악용)
            // ============================================================
            page.on('dialog', async dialog => {
                console.log(`   🚨 [경고창 감지] 내용: ${dialog.message()}`);
                await dialog.dismiss(); // 창 닫기
            });
// ============================================================
            // 8. 비밀번호 입력 단계 (최종: 고속 폴링 - 0.2초 간격 감지)
            // ============================================================
            console.log("STEP 5: 사용자 실시간 원격 입력 (High Speed Polling)");
            
            try {
                const pwInputSelector = '#add_browser_password';
                const admin = require('firebase-admin'); 
                const db = admin.firestore();
                
                // 1. 입력창 활성화
                const pwInput = targetFrame.locator(pwInputSelector);
                await pwInput.waitFor({ state: 'attached', timeout: 10000 });
                await targetFrame.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if(el) { el.focus(); el.click(); }
                }, pwInputSelector);
                await pwInput.click({ force: true });
                await page.waitForTimeout(2000);

                // 2. 세션 준비
                let requestId = data.sessionId; 
                if (!requestId) requestId = `${data.partnerUid || 'unknown'}_session`;
                const docRef = db.collection('scraping_requests').doc(requestId);

                // 설정 로드
                const configRef = db.collection('system_settings').doc('hometax_keypad_config');
                const configSnap = await configRef.get();
                let config = configSnap.exists ? configSnap.data() : {}; 

                // 3. 입력 루프
                let isKeypadActive = true;
                let loopCount = 0;
                
                // [최적화] 불필요한 스크린샷 방지용 캐시
                let lastScreenshotBase64 = null; 

                while (isKeypadActive && loopCount < 50) {
                    loopCount++;
                    console.log(`   [Round ${loopCount}] 입력 대기...`);

                    // (A) 스크린샷 (필요할 때만 찍음)
                    // 이전 라운드에서 '화면 갱신'이 필요하다고 판단했을 때만 찍고, 아니면 재활용
                    let screenshotBase64 = lastScreenshotBase64;
                    let currentOffset = { x: 0, y: 0 };
                    
                    // 첫 턴이거나, 이전 액션이 Refresh/Submit 이었다면 새로 찍음
                    // (여기서는 로직 단순화를 위해 매번 찍되, 조건부로 생략 가능)
                    // 하지만 사용자가 Shift를 언제 눌렀는지 모르니, 매 라운드 초반에는 찍어두는 게 안전합니다.
                    // 다만 속도를 위해 'Round 1'이 아니면 스킵하는 전략도 가능.
                    
                    if (!lastScreenshotBase64 || loopCount === 1) {
                        if (config.cropArea) {
                            try {
                                const buffer = await page.screenshot({ clip: config.cropArea });
                                screenshotBase64 = buffer.toString('base64');
                                currentOffset = { x: config.cropArea.x, y: config.cropArea.y };
                            } catch(e) {
                                const buffer = await page.screenshot({ fullPage: true });
                                screenshotBase64 = buffer.toString('base64');
                            }
                        } else {
                            const buffer = await page.screenshot({ fullPage: true });
                            screenshotBase64 = buffer.toString('base64');
                        }
                        lastScreenshotBase64 = screenshotBase64;
                    } else {
                        // 이미지는 재활용하되 좌표 오프셋은 유지
                        if (config.cropArea) currentOffset = { x: config.cropArea.x, y: config.cropArea.y };
                    }

                    // (B) DB 업데이트
                    await docRef.set({
                        status: 'WAITING_FOR_INPUT',
                        image: screenshotBase64,
                        mode: config.cropArea ? (config.zones ? 'INPUT' : 'CALIBR_ZONES') : 'CALIBR_CROP',
                        round: loopCount,
                        userId: data.partnerUid || 'unknown',
                        zones: config.zones || null,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // (C) [핵심] 고속 폴링 (Fast Polling)
                    let res = null;
                    // 0.2초 간격으로 600번 확인 (총 2분 대기)
                    for (let i = 0; i < 1200; i++) {
                        await page.waitForTimeout(100); // 0.2초 대기 (반응속도 5배 향상)
                        const snap = await docRef.get();
                        const d = snap.data();
                        
                        // 프론트엔드가 응답을 보냈는지 확인
                        if (d && d.status === 'INPUT_RECEIVED' && d.round === loopCount) {
                            res = d;
                            break;
                        }
                    }
                    
                    if (!res) throw new Error("사용자 입력 시간 초과");

                    // (D) 동작 처리
                    if (res.action === 'set_crop') {
                        config.cropArea = res.data;
                        await configRef.set(config, { merge: true });
                        lastScreenshotBase64 = null; // 설정 바뀌었으니 새로 찍어야 함
                        continue;
                    }
                    else if (res.action === 'set_zones') {
                        config.zones = res.data;
                        await configRef.set(config, { merge: true });
                        continue;
                    }
                    
                    // [입력] 클릭 실행
                    const clickPoint = res.coordinate;
                    const actualX = currentOffset.x + clickPoint.x;
                    const actualY = currentOffset.y + clickPoint.y;

                    const cdp = await browserContext.newCDPSession(page);
                    await page.mouse.move(actualX, actualY);
                    await page.mouse.down();
                    await page.waitForTimeout(50); // 클릭 시간도 단축 (50ms)
                    await page.mouse.up();
                    
                    console.log(`   🖱️ 클릭 실행 (${actualX}, ${actualY}) - Action: ${res.action}`);

                    // (E) Action별 분기
                    if (res.action === 'submit') {
                        console.log("   ✅ [Submit] 감지. 루프 종료.");
                        isKeypadActive = false;
                        break; 
                    } 
                    else if (res.action === 'refresh_click') {
                        // Shift: 화면이 바뀌어야 하므로 대기 후, 다음 라운드에서 새 스크린샷 찍게 함
                        await page.waitForTimeout(1000);
                        lastScreenshotBase64 = null; // 이미지 갱신 트리거
                    } 
                    else {
                        // 일반 클릭: 화면 안 바뀌므로 대기 없이 바로 다음 라운드 진행
                        // 이미지도 재활용 (lastScreenshotBase64 유지)
                        await page.waitForTimeout(50); // 최소한의 간격
                    }
                }

                // 4. 세션 종료
                await docRef.update({ status: 'SESSION_COMPLETED' });

                // 5. 최종 확인 버튼 클릭
                console.log("STEP 5-End: [확인] 버튼 클릭");
                await page.waitForTimeout(500);
                
                await targetFrame.evaluate(() => {
                    const obstacles = document.querySelectorAll('div[class*="transkey"], div[id*="layout"], div[id*="keyboard"]');
                    obstacles.forEach(el => el.style.display = 'none');
                });

                const finalConfirmBtn = targetFrame.locator('#ML_Dialog_common #btn_common_confirm');
                try {
                    await finalConfirmBtn.click({ force: true });
                    console.log("   🖱️ 클릭 성공!");
                } catch (err) {
                    await targetFrame.evaluate(() => {
                        const btn = document.querySelector('#ML_Dialog_common #btn_common_confirm');
                        if (btn) btn.click();
                        if (window.DSDialog && window.DSDialog.releaseDialog) window.DSDialog.releaseDialog();
                    });
                }

            } catch (e) {
                 throw new Error(`원격 입력 단계 실패: ${e.message}`);
            }

            console.log("   로그인 처리 중... (대기)");
            // ============================================================
            // 9. 결과 판독 (성공 vs 비밀번호 오류)
            // ============================================================
            console.log("STEP 9: 결과 확인 및 데이터 수집");

            // (A) 로그인 성공/실패 여부 판단
            try {
                const successSelector = '#mf_wfm_header_btn_logout';
                const errorPopupSelector = '#popup_alert';

                const checkError = async () => {
                    try {
                        await Promise.any([
                            page.waitForSelector(errorPopupSelector, { state: 'visible', timeout: 10000 }),
                            targetFrame.waitForSelector(errorPopupSelector, { state: 'visible', timeout: 10000 })
                        ]);
                        return 'ERROR';
                    } catch(e) { return null; }
                };

                const checkSuccess = async () => {
                    try {
                        await page.locator('text=로그아웃').or(page.locator(successSelector)).first().waitFor({ state: 'visible', timeout: 15000 });
                        return 'SUCCESS';
                    } catch(e) { return null; }
                };

                const resultState = await Promise.race([checkError(), checkSuccess()]);

                if (resultState === 'ERROR') {
                    console.warn("   🚨 [경고] 비밀번호 오류 팝업 감지됨!");
                    const errorMsg = await page.evaluate(() => {
                        const msgEl = document.querySelector('#alert_msg');
                        return msgEl ? msgEl.innerText : "비밀번호 불일치";
                    }).catch(() => "비밀번호 불일치");

                    await page.evaluate(() => { const btn = document.querySelector('#btn_alert_confirm'); if(btn) btn.click(); }).catch(()=>{});
                    throw new Error(`WRONG_PASSWORD: ${errorMsg}`);
                }

                if (resultState === 'SUCCESS') {
                    console.log("   🎉 [성공] 로그인 확인됨! 데이터 수집 시작...");
                } else {
                    throw new Error("로그인 상태를 확인할 수 없습니다. (타임아웃)");
                }

            } catch (e) {
                if (e.message.includes('WRONG_PASSWORD')) throw e;
                throw new Error(`로그인 검증 실패: ${e.message}`);
            }

            await page.waitForTimeout(2000); 
// ------------------------------------------------------------
            // (B) 데이터 수집 로직 분기 (NEW)
            // ------------------------------------------------------------
            page.removeAllListeners('dialog');
            
            const results = [];
            const isCashReceipt = data.scrapeType === 'cash_receipt';

            if (isCashReceipt) {
                // ========================================================
                // [CASE 1] 현금영수증 수집 (매입/매출 1~4분기)
                // ========================================================
                const targetYear = String(data.targetYear || new Date().getFullYear());
                console.log(` 📅 현금영수증 수집 시작 (연도: ${targetYear})`);

                // 1. [매출] 현금영수증
                try {
                    console.log("   🚀 [매출] 현금영수증 수집 중...");
                    const salesData = await scrapCashReceipts(page, targetYear, '매출');
                    if (salesData.length > 0) {
                        await saveToFirestore(db, data.partnerUid, 'CASH_SALES', salesData);
                    }
                    results.push({ type: '매출', count: salesData.length });
                    console.log(`   ✅ [매출] ${salesData.length}건 저장 완료`);
                } catch (e) {
                    console.error("   ⚠️ [매출] 실패:", e);
                    results.push({ type: '매출', error: e.message });
                }

                // 2. [매입] 현금영수증
                try {
                    console.log("   🚀 [매입] 현금영수증 수집 중...");
                    const purchaseData = await scrapCashReceipts(page, targetYear, '매입');
                    if (purchaseData.length > 0) {
                        await saveToFirestore(db, data.partnerUid, 'CASH_PURCHASE', purchaseData);
                    }
                    results.push({ type: '매입', count: purchaseData.length });
                    console.log(`   ✅ [매입] ${purchaseData.length}건 저장 완료`);
                } catch (e) {
                    console.error("   ⚠️ [매입] 실패:", e);
                    results.push({ type: '매입', error: e.message });
                }

            } else {
                // ========================================================
                // [CASE 2] 세금계산서 수집 (기존 로직 유지)
                // ========================================================
                const formatDate = (d) => d ? `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}` : '';
                const startDt = formatDate(data.startDate);
                const endDt = formatDate(data.endDate);

                console.log(` 📅 세금계산서 수집 기간: ${startDt} ~ ${endDt}`);

                // 매출
                try {
                    console.log("   🚀 [매출] 세금계산서 수집 시작...");
                    const salesData = await scrapTaxInvoices(page, startDt, endDt, '매출');
                    if (salesData.length > 0) {
                        await saveToFirestore(db, data.partnerUid, 'TAX_SALES', salesData);
                    }
                    results.push({ type: '매출', count: salesData.length });
                } catch (e) {
                    results.push({ type: '매출', error: e.message });
                }

                // 매입
                try {
                    console.log("   🚀 [매입] 세금계산서 수집 시작...");
                    const purchaseData = await scrapTaxInvoices(page, startDt, endDt, '매입');
                    if (purchaseData.length > 0) {
                        await saveToFirestore(db, data.partnerUid, 'TAX_PURCHASE', purchaseData);
                    }
                    results.push({ type: '매입', count: purchaseData.length });
                } catch (e) {
                    results.push({ type: '매입', error: e.message });
                }
            }

            return { success: true, message: "수집 완료", data: results };

        } catch (error) {
            console.error("스크래핑 로직 실패:", error);
            let errorMessage = error.message;
            if (errorMessage.includes('WRONG_PASSWORD')) errorMessage = "인증서 비밀번호가 일치하지 않습니다.";
            
            throw new functions.https.HttpsError('internal', errorMessage, {
                isWrongPassword: error.message.includes('WRONG_PASSWORD')
            });
        } finally {
            try {
                if (fs.existsSync(derPath)) fs.unlinkSync(derPath);
                if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
            } catch (e) {}
            if (browser) await browser.close();
        }
    });
// =============================================================================
// [Helper 1] 세금계산서 수집 및 다운로드 (매출/매입 선택 로직 강화)
// =============================================================================
async function scrapTaxInvoices(page, startDate, endDate, type) {
    console.log(`   [${type}] 메뉴 이동 및 데이터 조회 시작...`);

    // 1. 메뉴 이동
    try {
        const topMenu = page.locator('text=조회/발급').first();
        if (await topMenu.isVisible()) { await topMenu.hover(); await page.waitForTimeout(500); }
        await page.evaluate(() => {
            const menu = document.getElementById('menuAtag_4609050100');
            if (menu) menu.click();
        });
        await page.waitForTimeout(5000);
    } catch(e) {
        await page.goto("https://www.hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index.xml&tmIdx=0&tm2lIdx=0105010000&tm3lIdx=0105010100", { waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);
    }

    // 2. iframe 탐색
    let targetFrame = null;
    for(let i=0; i<5; i++) {
        const frames = page.frames();
        for (const frame of frames) {
            try {
                if (await frame.locator('#mf_txppWframe_trigger50').count() > 0) {
                    targetFrame = frame;
                    break;
                }
            } catch(e) {}
        }
        if (targetFrame) break;
        await page.waitForTimeout(2000);
    }
    if (!targetFrame) {
        if (await page.locator('#mf_txppWframe_trigger50').count() > 0) targetFrame = page;
        else throw new Error("조회 화면을 찾을 수 없습니다.");
    }

    // 3. [핵심 수정] 조회 조건 설정 (매출/매입)
    // input ID 대신, 텍스트("매출", "매입")를 가진 Label을 클릭합니다.
    console.log(`   구분 변경 시도: ${type}`);
    
    await targetFrame.evaluate((targetType) => {
        // 라디오 버튼의 라벨을 찾아서 클릭 (WebSquare는 라벨 클릭 시 이벤트 트리거됨)
        const labels = document.querySelectorAll('label.w2radio_label');
        for (let label of labels) {
            if (label.innerText.trim() === targetType) {
                label.click();
                return;
            }
        }
    }, type);
    
    // 상태 반영 대기
    await page.waitForTimeout(1000);

    // 날짜 입력
    await targetFrame.fill('input[id*="inqrDtStrt_input"]', startDate);
    await targetFrame.fill('input[id*="inqrDtEnd_input"]', endDate);
    
    // 조회 버튼 클릭
    await targetFrame.click('#mf_txppWframe_trigger50');
    console.log("   [조회] 버튼 클릭. 로딩 대기...");
    
    try {
        await targetFrame.waitForSelector('table[id*="resultGrid_body_table"]', { state: 'visible', timeout: 15000 });
    } catch(e) {}

    // 4. 다운로드 프로세스
    console.log("   [내려받기] 버튼 클릭...");
    const downloadBtn = targetFrame.locator('#mf_txppWframe_trigger55');
    if (await downloadBtn.isVisible()) {
        await downloadBtn.click();
    } else {
        console.log("   내려받기 버튼 없음 -> 데이터 0건");
        return [];
    }
    await page.waitForTimeout(3000);

    // [1차 팝업] 옵션 체크
    try {
        await targetFrame.evaluate(() => {
            // ID 기반 강제 클릭
            const chk1 = document.getElementById('mf_txppWframe_UTEETBDA17_wframe_checkbox1_input_0');
            const chk2 = document.getElementById('mf_txppWframe_UTEETBDA17_wframe_checkbox2_input_0');
            const btn = document.getElementById('mf_txppWframe_UTEETBDA17_wframe_btnProcess');
            if (chk1 && !chk1.checked) chk1.click();
            if (chk2 && !chk2.checked) chk2.click();
            if (btn) btn.click();
        });
    } catch(e) {}
    await page.waitForTimeout(2000);

    // [2차 팝업] 다운로드
    let allData = [];
    const dropdownId = 'mf_txppWframe_UTEETBDA17_wframe_crrnPageForExcelDwlld';
    
    const hasDropdown = await targetFrame.evaluate((id) => {
        const el = document.getElementById(id);
        return el && el.offsetParent !== null;
    }, dropdownId);
    
    if (hasDropdown) {
        const optionCount = await targetFrame.locator(`#${dropdownId} option`).count();
        console.log(`   대용량 분할 다운로드 (${optionCount}개)`);
        
        for (let i = 0; i < optionCount; i++) {
            await targetFrame.locator(`#${dropdownId}`).selectOption({ index: i });
            await page.waitForTimeout(1000);
            const data = await downloadAndProcessZip(page, targetFrame);
            allData.push(...data);
        }
    } else {
        console.log("   단일 파일 다운로드");
        const data = await downloadAndProcessZip(page, targetFrame);
        allData.push(...data);
    }

    try {
        await targetFrame.evaluate(() => {
            const btn = document.getElementById('mf_txppWframe_UTEETBDA17_wframe_trigger10001');
            if (btn) btn.click();
        });
    } catch(e) {}

    return allData;
}
// =============================================================================
// [Helper B] ⭐ 현금영수증 수집 함수 (매입/매출 탭 ID 분기 처리)
// =============================================================================
async function scrapCashReceipts(page, year, type) {
    const isSales = type === '매출';
    
    // 1. 메뉴 이동 ID
    const targetMenuId = isSales ? 'menuAtag_4606010100' : 'menuAtag_4605010100';
    
    console.log(`   🎯 [${type}] 메뉴 이동 ID: ${targetMenuId}`);

    // 1. 메뉴 이동 (JS 강제 클릭)
    try {
        await page.waitForSelector('#mf_wfHeader_menu46Scrollbox', { state: 'attached', timeout: 10000 });
        const clicked = await page.evaluate((id) => {
            const el = document.getElementById(id);
            if (el) { el.click(); return true; }
            return false;
        }, targetMenuId);

        if (!clicked) throw new Error(`메뉴 ID(${targetMenuId})를 찾을 수 없습니다.`);
        await page.waitForTimeout(5000); 

    } catch(e) {
        console.error(`     ⚠️ 메뉴 이동 실패: ${e.message}`);
        return [];
    }

    // 2. 타겟 설정 (메인 페이지)
    const targetFrame = page; 

    // 3. [핵심 수정] 탭 전환 ("분기별") - ID 기반 타겟팅
    try {
        console.log("     🔄 [분기별] 탭 전환 시도...");
        
        // 매입/매출에 따라 탭 ID가 다름 (사용자 제공 HTML 기반)
        // 매입: mf_txppWframe_tabControl1_UTECRCB005_tab_tabs4
        // 매출: mf_txppWframe_tabControl1_UTECRCB057_tab_tabs4
        const tabId = isSales 
            ? 'mf_txppWframe_tabControl1_UTECRCB057_tab_tabs4' 
            : 'mf_txppWframe_tabControl1_UTECRCB005_tab_tabs4';

        // JS로 직접 클릭 (가장 확실함)
        const tabClicked = await targetFrame.evaluate((id) => {
            const tab = document.getElementById(id);
            if (tab) {
                tab.click(); // li 태그 클릭
                // 혹시 li 안의 a 태그를 눌러야 할 수도 있으니 둘 다 시도
                const link = tab.querySelector('a');
                if (link) link.click();
                return true;
            }
            return false;
        }, tabId);

        if (tabClicked) {
            console.log(`     ✅ 탭 클릭 성공 (ID: ${tabId})`);
            await page.waitForTimeout(2000); // 탭 전환 및 UI 렌더링 대기
        } else {
            throw new Error(`탭 ID(${tabId})를 찾을 수 없음`);
        }

    } catch (e) {
        console.warn("     ⚠️ 탭 전환 실패 (Fallback 시도):", e.message);
        // 실패 시 텍스트로 재시도 (이번엔 정확한 선택자 사용)
        const fallbackTab = targetFrame.locator('li[id*="tab_tabs4"] a[title*="분기별"]');
        if (await fallbackTab.count() > 0) {
            await fallbackTab.first().click({ force: true });
            await page.waitForTimeout(2000);
        }
    }

    let allData = [];
    const quarters = [1, 2, 3, 4];

    for (const q of quarters) {
        console.log(`   Processing ${year}년 ${q}분기...`);
        
        try {
            // 3-1. 연도/분기 선택 (WebSquare 강제 주입)
            const forceSelect = async (selector, text) => {
                await targetFrame.evaluate(({sel, txt}) => {
                    const el = document.querySelector(sel);
                    if (el) {
                        for (let i = 0; i < el.options.length; i++) {
                            if (el.options[i].text.includes(txt)) {
                                el.selectedIndex = i;
                                el.dispatchEvent(new Event('change', { bubbles: true })); 
                                break;
                            }
                        }
                    }
                }, { sel: selector, txt: text });
            };

            await forceSelect('#mf_txppWframe_selectTrsYr', `${year}년`);
            await forceSelect('#mf_txppWframe_selectQrt', `${q}분기`);
            await page.waitForTimeout(500);

            // 3-2. 조회 버튼 클릭
            console.log("     🔍 [조회] 버튼 클릭 시도...");
            
            // ID 기반 JS 클릭
            await targetFrame.evaluate(() => {
                const btn = document.getElementById('mf_txppWframe_trigger1');
                if (btn) btn.click();
            });
            
            // 데이터 로딩 대기 (5초)
            await page.waitForTimeout(5000); 
            
            // 3-3. 내려받기 버튼 클릭
            console.log("     ⬇️ [내려받기] 버튼 클릭 시도...");
            const downBtn = targetFrame.locator('#mf_txppWframe_trigger12');
            
            try { await downBtn.waitFor({ state: 'attached', timeout: 3000 }); } catch(e) {}

            if (await downBtn.count() > 0) {
                // 알림창 감지
                let hasNoDataAlert = false;
                const tempDialogHandler = async (dialog) => {
                    const msg = dialog.message();
                    if (msg.includes('없') || msg.includes('존재하지')) {
                        hasNoDataAlert = true;
                        console.log(`     🚨 알림창 감지: ${msg}`);
                    }
                    await dialog.accept();
                };
                page.on('dialog', tempDialogHandler);

                await downBtn.click({ force: true });
                await page.waitForTimeout(2000);

                page.off('dialog', tempDialogHandler);

                if (hasNoDataAlert) {
                    console.log(`     -> ${q}분기 데이터 없음`);
                    continue;
                }

                // 4. 다운로드 팝업 처리
                const textBtn = targetFrame.locator('input[value="텍스트"]');
                if (await textBtn.count() > 0) {
                    console.log(`     ✅ 다운로드 팝업 확인됨.`);
                    const qData = await processDownloadPopup(page, targetFrame, type);
                    allData.push(...qData);
                    console.log(`     -> ${q}분기 ${qData.length}건 수집 완료`);
                } else {
                    // 팝업 안 떴으면 JS로 재시도
                    console.log(`     ⚠️ 팝업 안 뜸 (재시도)`);
                    await targetFrame.evaluate(() => {
                        const btn = document.getElementById('mf_txppWframe_trigger12');
                        if (btn) btn.click();
                    });
                    await page.waitForTimeout(2000);
                    
                    if (await textBtn.count() > 0) {
                        const qData = await processDownloadPopup(page, targetFrame, type);
                        allData.push(...qData);
                    }
                }

            } else {
                console.log(`     -> ⚠️ ${q}분기 [내려받기] 버튼 없음`);
            }

        } catch (err) {
            console.error(`     -> ${q}분기 처리 중 오류:`, err.message);
        }
    }

    return allData;
}
// =============================================================================
// [Helper C] 다운로드 팝업 처리 (ZIP 제거 -> TXT 직접 파싱)
// =============================================================================
async function processDownloadPopup(page, frame, type) {
    // const AdmZip = require('adm-zip'); // 현금영수증은 ZIP 아님 -> 제거
    const iconv = require('iconv-lite');
    let parsedData = [];

    // 1. 범위 선택 SelectBox
    // ID: mf_txppWframe_UTECRCB055_wframe_selectDwldRngForExcel
    const rangeSelect = frame.locator('select[id*="selectDwldRngForExcel"]');
    
    let optionCount = 1;
    if (await rangeSelect.count() > 0) {
        optionCount = await rangeSelect.locator('option').count();
    }

    console.log(`     ⬇️ 분할 다운로드 진행 (총 ${optionCount}회)`);

    for (let i = 0; i < optionCount; i++) {
        // 범위 선택
        if (optionCount > 1) {
            await rangeSelect.selectOption({ index: i });
            await page.waitForTimeout(500);
        }

        // 2. 텍스트 버튼 클릭
        const textBtn = frame.locator('input[id*="trigger5"][value="텍스트"]');
        
        // 다운로드 리스너 설정
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
        
        // 확인창 처리
        const dialogHandler = async (dialog) => { await dialog.accept(); };
        page.on('dialog', dialogHandler);

        if (await textBtn.count() > 0) {
            await textBtn.first().click();
        } else {
            await frame.locator('input[value="텍스트"]').click();
        }

        try {
            const download = await downloadPromise;
            const stream = await download.createReadStream();
            
            // 스트림을 버퍼로 변환
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const fileBuffer = Buffer.concat(chunks);

            // [핵심 수정] ZIP 해제 로직 삭제 -> 바로 텍스트 변환
            // 사용자가 요청한 UTF-8로 디코딩
            const text = iconv.decode(fileBuffer, 'utf-8');
            
            // 파싱 수행
            const rows = parseCashReceiptText(text, type);
            parsedData.push(...rows);
            
            console.log(`     📄 파일 파싱 완료: ${rows.length}건`);

        } catch (e) {
            console.error(`     ❌ 다운로드 및 파싱 실패 (Range ${i+1}):`, e.message);
        } finally {
            page.off('dialog', dialogHandler);
        }
        
        await page.waitForTimeout(1000);
    }

    // 3. 팝업 닫기
    const closeBtn = frame.locator('input[value="닫기"]').last();
    if (await closeBtn.count() > 0) {
        await closeBtn.click();
    }
    await page.waitForTimeout(1000);

    return parsedData;
}
// =============================================================================
// [Helper D] 현금영수증 텍스트 파서 (매입/매출 헤더 분석 완벽 적용)
// =============================================================================
function parseCashReceiptText(text, type) {
    const lines = text.split('\n');
    const data = [];
    const isSales = type === '매출';

    // [규칙] 첫번째 줄 무시, 두번째 줄 헤더, 세번째 줄(Index 2)부터 데이터
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = line.split('\t');
        
        // 금액 파싱 헬퍼 (콤마 제거)
        const parseNum = (val) => parseInt(val?.replace(/,/g, '') || '0');

        let item = {};

        if (isSales) {
            // [매출] (사용자 제공 헤더 기준)
            // 0:발행구분, 1:매출일시, 2:공급가액, 3:부가세, 4:봉사료, 5:총금액, 
            // 6:승인번호, 7:신분확인뒷4자리, 8:거래구분, 9:용도구분, 10:비고
            
            item = {
                tradeDate: row[1]?.trim(),        // 매출일시
                franchiseName: row[7]?.trim(),    // 신분확인뒷4자리 (구매자 식별정보로 사용)
                approvalNo: row[6]?.trim(),       // 승인번호
                
                supplyAmount: parseNum(row[2]),   // 공급가액
                taxAmount: parseNum(row[3]),      // 부가세
                serviceAmount: parseNum(row[4]),  // 봉사료
                totalAmount: parseNum(row[5]),    // 총금액
                
                type: row[8]?.trim() || '승인',   // 거래구분 (승인거래/취소거래)
                remark: row[9]?.trim(),           // 용도구분 (소비자소득공제용 등)
                inOut: '매출'
            };
        } else {
            // [매입] (이전 분석 기준 유지)
            // 0:매입일시, 1:사용자명, 2:가맹점사업자번호, 3:가맹점명, 4~6:업종코드 등
            // 7:공급가액, 8:부가세, 9:봉사료, 10:매입금액, 11:승인번호, 12:발급수단, 13:거래구분, 14:공제여부
            
            item = {
                tradeDate: row[0]?.trim(),       // 매입일시
                franchiseRegNo: row[2]?.trim(),  // 가맹점사업자번호
                franchiseName: row[3]?.trim(),   // 가맹점명
                
                supplyAmount: parseNum(row[7]),  // 공급가액
                taxAmount: parseNum(row[8]),     // 부가세
                serviceAmount: parseNum(row[9]), // 봉사료
                totalAmount: parseNum(row[10]),  // 매입금액
                
                approvalNo: row[11]?.trim(),     // 승인번호
                type: row[13]?.trim() || '승인', // 거래구분
                remark: row[14]?.trim(),         // 공제여부 등
                inOut: '매입'
            };
        }

        // 유효성 검사: 승인번호가 있고 합계가 0이 아니거나 유효한 데이터일 경우
        if (item.approvalNo && (item.totalAmount !== 0 || item.type.includes('취소'))) {
            data.push(item);
        }
    }
    return data;
}
// =============================================================================
// [Helper 2] ZIP 다운로드 및 파싱 (UTF-8 인코딩 수정)
// =============================================================================
async function downloadAndProcessZip(page, frame) {
    const AdmZip = require('adm-zip');
    const iconv = require('iconv-lite');

    // 1. 기존 리스너 제거 (충돌 방지)
    page.removeAllListeners('dialog');

    // 2. 다운로드 전용 다이얼로그 핸들러 등록
    const dialogHandler = async (dialog) => {
        console.log(`   🚨 다운로드 확인창: ${dialog.message()} -> 수락`);
        try { await dialog.accept(); } catch(e) {}
    };
    page.on('dialog', dialogHandler);

    // 3. 다운로드 시작
    const downloadPromise = page.waitForEvent('download');
    
    console.log("   [텍스트] 다운로드 버튼 클릭...");
    await frame.evaluate(() => {
        const btn = document.getElementById('mf_txppWframe_UTEETBDA17_wframe_trigger5');
        if (btn) btn.click();
        else throw new Error("텍스트 다운로드 버튼 못 찾음");
    });
    
    // 4. 스트림 처리
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const zipBuffer = Buffer.concat(chunks);
    
    console.log(`   📦 파일 다운로드 완료 (${zipBuffer.length} bytes)`);

    // 5. 리스너 정리
    page.off('dialog', dialogHandler);
    
    // 6. 압축 해제 및 파싱
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let mainList = [];
    let itemList = [];

    zipEntries.forEach(entry => {
        // [핵심 수정] cp949 -> utf-8로 변경
        // 홈택스 텍스트 파일이 UTF-8 형식임이 확인되었습니다.
        const text = iconv.decode(entry.getData(), 'utf-8');
        
        if (entry.entryName.includes('Etxiv')) {
            mainList = parseEtxiv(text); 
        } else if (entry.entryName.includes('Item')) {
            itemList = parseItem(text); 
        }
    });
    
    console.log(`   📄 파싱 결과: 메인 ${mainList.length}건, 상세 ${itemList.length}건`);

    return mainList.map(invoice => ({
        ...invoice,
        items: itemList.filter(it => it.approvalNo === invoice.approvalNo)
    }));
}
// =============================================================================
// [Helper 3] 파서: Etxiv.txt (수정됨: undefined 방지)
// =============================================================================
function parseEtxiv(text) {
    const lines = text.split('\n');
    const data = [];
    
    // 6번째 줄(Index 5)부터 데이터
    for (let i = 5; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; 

        const row = line.split('\t');
        // 안전장치
        if (row.length < 24) {
             while(row.length < 24) row.push("");
        }
        
        data.push({
            writeDate: row[0]?.trim() || "",       
            approvalNo: row[1]?.trim() || "",      
            issueDate: row[2]?.trim() || "",       
            sendDate: row[3]?.trim() || "",        
            vendorRegNo: row[4]?.trim() || "",     
            vendorName: row[6]?.trim() || "",      
            vendorCeo: row[7]?.trim() || "",       
            vendorAddr: row[8]?.trim() || "",      
            buyerRegNo: row[9]?.trim() || "",      
            buyerName: row[11]?.trim() || "",      
            buyerCeo: row[12]?.trim() || "",       
            buyerAddr: row[13]?.trim() || "",      
            totalAmount: parseInt(row[14]?.replace(/,/g, '') || '0'),
            supplyAmount: parseInt(row[15]?.replace(/,/g, '') || '0'),
            taxAmount: parseInt(row[16]?.replace(/,/g, '') || '0'),
            type: row[18]?.trim() || "",           
            issueType: row[19]?.trim() || "",      
            remark: row[20]?.trim() || "",         
            receiptType: row[21]?.trim() || "",    
            email1: row[22]?.trim() || "",         
            email2: row[23]?.trim() || ""          
        });
    }
    return data;
}

// =============================================================================
// [Helper 4] 파서: Item.txt (수정됨: undefined 방지)
// =============================================================================
function parseItem(text) {
    const lines = text.split('\n');
    const data = [];
    
    // 4번째 줄(Index 3)부터 데이터
    for (let i = 3; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = line.split('\t');
        // 데이터 길이가 부족하면 빈 값으로 채움 (안전장치)
        if (row.length < 12) {
             while(row.length < 12) row.push("");
        }

        // [중요] 모든 필드에 || "" (빈 문자열 처리)를 추가하여 undefined 방지
        data.push({
            approvalNo: row[0]?.trim() || "",      // 승인번호
            seq: row[1]?.trim() || "",             // 품목순번
            date: row[4]?.trim() || "",            // 일자
            itemName: row[5]?.trim() || "",        // 품목명
            spec: row[6]?.trim() || "",            // 규격
            qty: row[7]?.trim() || "0",            // 수량
            unitPrice: parseInt(row[8]?.replace(/,/g, '') || '0'),     // 단가
            supplyAmount: parseInt(row[9]?.replace(/,/g, '') || '0'),  // 공급가액
            taxAmount: parseInt(row[10]?.replace(/,/g, '') || '0'),    // 세액
            remark: row[11]?.trim() || ""          // 비고 (여기가 문제였음)
        });
    }
    return data;
}
// =============================================================================
// [Helper 5] Firestore 저장 함수 (기존과 동일 - 현금영수증도 같은 로직 사용)
// =============================================================================
async function saveToFirestore(db, uid, collectionName, dataList) {
    if (dataList.length === 0) return;
    
    const batchSize = 400; 
    for (let i = 0; i < dataList.length; i += batchSize) {
        const batch = db.batch();
        const chunk = dataList.slice(i, i + batchSize);
        
        chunk.forEach(item => {
            // 현금영수증은 '승인번호'를 ID로 사용 (중복 방지)
            const docId = item.approvalNo || `unknown_${Date.now()}_${Math.random()}`;
            const docRef = db.collection('users').doc(uid)
                             .collection(collectionName).doc(docId);
            
            // 기존 데이터가 있으면 merge, 없으면 생성
            // (옵션: scrapeDate 등을 추가하여 언제 수집했는지 기록 가능)
            batch.set(docRef, { ...item, lastScraped: new Date().toISOString() }, { merge: true });
        });
        
        await batch.commit();
    }
}