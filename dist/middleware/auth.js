"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateRequest = void 0;
const supabase_1 = require("../utils/supabase");
const authenticateRequest = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ message: 'Authorization header missing or malformed' });
            return;
        }
        const token = authHeader.split(' ')[1];
        const { data: tokenData, error } = yield supabase_1.supabase.auth.getUser(token);
        if (error || !tokenData) {
            res.status(401).json({ message: 'Invalid or expired token' });
            return;
        }
        const { data: profileData, error: profileError } = yield supabase_1.supabase.from('profiles').select('*').eq('id', tokenData.user.id).single();
        req.user = Object.assign(Object.assign({}, tokenData.user), { team_id: profileData === null || profileData === void 0 ? void 0 : profileData.team_id, pod_id: profileData === null || profileData === void 0 ? void 0 : profileData.pod_id, role: profileData === null || profileData === void 0 ? void 0 : profileData.role });
        next();
    }
    catch (error) {
        console.error('Error authenticating request:', error);
        res.status(500).json({ message: 'Internal server error' });
        return;
    }
});
exports.authenticateRequest = authenticateRequest;
