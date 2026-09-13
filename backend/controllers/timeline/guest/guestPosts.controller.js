const guestPostsService = require('../../../services/timeline/guest/guestPosts.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.getPosts = handleService((req) => guestPostsService.getPosts(req.body));

exports.getPostDetail = handleService((req) => guestPostsService.getPostDetail(req.body));

exports.createPost = handleService((req) => guestPostsService.createPost(req.body, req.io));
