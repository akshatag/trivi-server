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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../utils/supabase");
const db_1 = require("../utils/db");
const router = express_1.default.Router();
// Create a new user when the user first signs up. Just expects a session object in the request
router.post('/init', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const domain = req.user.email.split('@')[1];
    const { data, error } = yield supabase_1.supabase
        .from('teams')
        .select('*')
        .eq('domain', domain)
        .single();
    if (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    if (!data) {
        res.status(404).json({ message: 'Team not found' });
        return;
    }
    const teamId = data.id;
    console.log('id: ' + req.user.id);
    console.log('email: ' + req.user.email);
    console.log('teamId: ' + teamId);
    // TODO: if there aren't other users in the team, set the role to 'TEAM_ADMIN'
    const { data: insertData, error: insertError } = yield supabase_1.supabase
        .from('profiles')
        .insert([{ id: req.user.id, email: req.user.email, team_id: teamId, role: 'POD_MEMBER', name: req.user.email.split('@')[0] }]);
    if (insertError) {
        console.error('Error inserting user:', insertError);
        res.status(500).json({ message: insertError.message });
        return;
    }
    else {
        res.status(201).json({ message: 'User created successfully!' });
        return;
    }
}));
// Update a user
router.put('/', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let updateParams = {};
    if (req.body.name) {
        updateParams['name'] = req.body.name;
    }
    if (req.body.role) {
        updateParams['role'] = req.body.role;
    }
    if (req.body.pod_id) {
        updateParams['pod_id'] = req.body.pod_id;
    }
    if (req.body.onboarding_complete) {
        updateParams['onboarding_complete'] = req.body.onboarding_complete;
    }
    const { data, error } = yield supabase_1.supabase
        .from('profiles')
        .update(updateParams)
        .eq('id', req.user.id);
    if (error) {
        console.error('Error inserting user:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.status(200).json({ message: 'User updated successfully!' });
    return;
}));
// Get user profile information
router.get('/', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { data, error } = yield supabase_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', req.user.id)
        .maybeSingle();
    if (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.json(data);
}));
// Get user profile information
router.get('/all', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.user.role != 'TEAM_ADMIN') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const data = yield db_1.pgpool.query(`
        SELECT 
          profiles.*,
          users.email as email,
          pods.name as pod_name
        FROM (
          SELECT * FROM profiles WHERE profiles.team_id = $1) AS profiles
        LEFT JOIN pods ON profiles.pod_id = pods.id
        LEFT JOIN auth.users on profiles.id = users.id; 
    `, [req.user.team_id]);
        res.json(data.rows);
        return;
    }
    catch (error) {
        console.error('Error getting scores:', error);
        res.status(500).json({ message: error });
        return;
    }
}));
// Update user profile
router.post('/profile', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, pod_id } = req.body;
    const user_id = req.user.id;
    const { error } = yield supabase_1.supabase
        .from('profiles')
        .update({ name, pod_id })
        .eq('id', user_id);
    if (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.status(200).json({ message: 'Profile updated successfully!' });
    return;
}));
// Update user role
router.post('/role', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.user.role != 'TEAM_ADMIN') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    const targetUserId = req.body.target_user_id;
    const targetRole = req.body.target_role;
    if (!['TEAM_ADMIN', 'POD_MEMBER'].includes(targetRole)) {
        res.status(400).json({ message: 'Invalid role' });
        return;
    }
    console.log('targetUserId: ' + targetUserId);
    console.log('targetRole: ' + targetRole);
    const { data, error } = yield supabase_1.supabase
        .from('profiles')
        .update({ role: targetRole })
        .eq('team_id', req.user.team_id)
        .eq('id', targetUserId);
    if (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.status(201).json({ message: 'Role update successful!' });
    return;
}));
// Update user pod
router.post('/pod', auth_1.authenticateRequest, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.user.role != 'TEAM_ADMIN') {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    const targetUserId = req.body.target_user_id;
    const targetPodId = req.body.target_pod_id;
    console.log('targetUserId: ' + targetUserId);
    console.log('targetPod: ' + targetPodId);
    const { data, error } = yield supabase_1.supabase
        .from('profiles')
        .update({ pod_id: targetPodId })
        .eq('team_id', req.user.team_id)
        .eq('id', targetUserId);
    if (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: error.message });
        return;
    }
    res.status(201).json({ message: 'Pod update successful!' });
    return;
}));
exports.default = router;
