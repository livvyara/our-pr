// functions/index.js

const functions = require("firebase-functions/v1"); // ⭐ v1 SDK를 명시적으로 가져옵니다.
const { HttpsError } = require("firebase-functions/v1/https");
const logger = functions.logger; 
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

// Node.js 필수 내장 모듈
const os = require("os");
const fs = require("fs"); 
const path = require("path"); 

// ⭐ [핵심] 환경 변수 읽기 (functions:config:set 값)
// 이전에 등록한 NCP 키들을 읽습니다.
const config = functions.config().ncp; 

admin.initializeApp();

// ----------------------------------------------------
// --- 헬퍼 함수: Naver SENS API 호출 로직 (문자 발송 엔진) ---
// ----------------------------------------------------
async function executeSmsSend(recipientPhoneNumber, message, logContext) {
    logger.info(`[SMS 발송 시도]`, { context: logContext, recipient: recipientPhoneNumber });

    if (!recipientPhoneNumber || !message) {
        logger.error("필수 정보 누락. SMS 발송 실패.", { context: logContext });
        return;
    }

    // SENS 환경 변수 로드
    const serviceId = config.service_id;
    const accessKey = config.access_key;
    const secretKey = config.secret_key;
    const sender = config.sender_number;
    
    if (!serviceId || !accessKey || !secretKey || !sender) {
        logger.error("NCP 환경 변수가 설정되지 않았습니다. 배포 설정(functions:config:set) 확인 필요.", { context: logContext });
        return;
    }

    // 메시지 길이 계산: Node.js Buffer 사용
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
        type: messageType,
        contentType: "COMM",
        countryCode: "82",
        from: sender,
        content: message,
        messages: [{ to: formattedPhoneNumber }],
    };

    try {
        const response = await axios.post(
            `https://sens.apigw.ntruss.com/sms/v2/services/${serviceId}/messages`,
            body,
            {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "x-ncp-apigw-timestamp": timestamp,
                    "x-ncp-iam-access-key": accessKey,
                    "x-ncp-apigw-signature-v2": signature,
                },
            }
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
// 1. 휴대폰 인증번호 발송 요청 (sendVerificationCode)
// ----------------------------------------------------
exports.sendVerificationCode = functions
    .region("asia-northeast3") // ⭐ .region()을 .https 앞으로 이동
    .https.onCall(async (data, context) => {
    const phoneNumber = data.phoneNumber;
    if (!phoneNumber) {
        throw new HttpsError("invalid-argument", "휴대폰 번호는 필수입니다.");
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 3 * 60 * 1000); // 3분 만료

    try {
        const docRef = admin.firestore().collection("phone_verifications").doc(phoneNumber);
        await docRef.set({ code: verificationCode, expiresAt: expiresAt });

        const message = `[MyWebApp] 인증번호 [${verificationCode}]를 입력해주세요.`;
        await executeSmsSend(phoneNumber, message, "휴대폰 인증번호 발송");

        return { success: true, message: "인증번호가 발송되었습니다." };

    } catch (error) {
        logger.error("인증번호 발송 중 오류 발생:", error);
        throw new HttpsError("internal", "인증번호 발송에 실패했습니다.");
    }
});

// ----------------------------------------------------
// 2. 휴대폰 인증번호 확인 (checkVerificationCodeForSignup)
// ----------------------------------------------------
exports.checkVerificationCodeForSignup = functions
    .region("asia-northeast3") // ⭐ .region()을 .https 앞으로 이동
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

        await docRef.delete(); // 인증 성공: 사용된 인증번호 문서를 즉시 삭제
        return { success: true, message: "휴대폰 번호가 인증되었습니다." };

    } catch (error) {
        if (error instanceof HttpsError) { throw error; }
        logger.error("회원가입 인증번호 확인 중 오류 발생:", error);
        throw new HttpsError("internal", "인증 과정에서 오류가 발생했습니다.");
    }
});