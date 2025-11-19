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