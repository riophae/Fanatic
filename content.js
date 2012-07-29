var ce = chrome.extension;
// Chrome 20 开始启用新的 API, 在老版本中伪造这些 API
ce.sendMessage = ce.sendMessage || ce.sendRequest;
ce.onMessage = ce.onMessage || ce.onRequest;

// 选择器相关便捷方法
var $ = document.getElementById.bind(document);
var $$ = function (selector, parent) {
	return (arguments.length > 1 ? parent : document).querySelectorAll(selector);
}
var _ = function (selector, parent) {
	return (arguments.length > 1 ? parent : document).querySelector(selector);
}

// 全局变量
var loaded = false;
var settings, data;
var cache;
var proxies = []; // 事件代理监听器列表
var attr = consts.processedAttr; // 消息处理方法标记

// 是否为用户页面
function isUserPage() {
	var meta = _('meta[name="author"]');
	return meta != null && meta.getAttribute('content') != null;
}

// 是否为私信页
function isPMPage() {
	var pm_url = 'http://fanfou.com/privatemsg';
	return location.href.indexOf(pm_url) === 0;
}

// 是否为随便看看页面
function isBrowsingPage() {
	var browse = 'http://fanfou.com/browse';
	return location.href.indexOf(browse) === 0;
}

// 每次加载新消息后, 被隐藏、折叠或清除的消息的数量
var percolation_count = 0;
// 如果被过滤消息超过 5 条, 继续加载等同或更多数量的消息
var checkPercolations = throttle(
	(function (more_needed) {
		return function () {
			if (! settings.autoLoad) return;
			var supplied = 20 - percolation_count;
			more_needed -= supplied;
			if (more_needed > 5) {
				setTimeout(
					loadMore,
					Math.max(settings.loadDelay - 200, 0)
				);
			} else {
				more_needed = 20;
			}
			percolation_count = 0;
		}
	})(20)
, 200);

// 消息流
var stream = $('stream');

// 处理方法
var measures = {};
// 染色处理
measures.colorize = {
	processed: 'colorized',
	do: function (item) {
		var bg_color = item.matchedFilter.bgColor;
		item.setAttribute(attr, this.processed);
		item.setAttribute('fanatic-bg-color', bg_color.join(', '));
	},
	undo: function (item) {
		item.removeAttribute(attr);
		item.removeAttribute('fanatic-bg-color');
	}
};
// 折叠消息
measures.eliminate = {
	processed: 'eliminated',
	do: function (item) {
		item.setAttribute(attr, this.processed);
	},
	undo: function (item) {
		item.removeAttribute(attr);
	}
};
// 隐藏消息
measures.hide = {
	processed: 'hidden',
	do: function (item) {
		item.setAttribute(attr, this.processed);
		hideItem(item);
	},
	undo: function (item) {
		item.removeAttribute(attr);
		showItem(item);
	}
};
// 清除消息
measures.remove = {
	processed: 'removed',
	do: function (item) {
		removeReplies(item);
		removeElem(item);
	},
	undo: function (item) {
	}
};
// 保护消息
measures.protect = {
	processed: 'protected',
	do: function (item) {
		item.setAttribute(attr, this.processed);
	},
	undo: function (item) {
		item.removeAttribute(attr);
	}
};

// 特殊处理被过滤消息
['eliminate', 'hide', 'remove'].
forEach(function (type) {
	var measure = measures[type];
	var func = measure.do;
	measure.do = function (item) {
		// 判断是否为 太空饭否++ 的展开评论/转发消息
		if (! isExpandedItem(item)) {
			// 只对非 太空饭否++ 展开的消息进行统计
			// 统计该次加载后被过滤消息数量
			percolation_count++;
		} else {
			item.isExpandedItem = true;
		}
		// 对消息进行相应的过滤处理
		return func.call(this, item);
	}
});

// 从 DOM 读取供匹配的原始数据
function getSourceData(item, focus_type, match_type) {
	var ret;
	switch (focus_type) {
	case 'id': case 'username': case 'client':
	case 'replyUsername': case 'repostUsername':
		ret = item[focus_type];
		break;
	case 'content':
		if (item[focus_type]) {
			// 如果匹配方法为正则表达式, 则使用 HTML 源码作为供匹配文本
			if (match_type === 'regexp')
				ret = item[focus_type].innerHTML;
			else
				ret = item[focus_type].textContent;
		}
		break;
	case 'mentionedIds': case 'mentionedUsernames':
		ret = (
			item[
				focus_type.substring(0, focus_type.length)
			] || []
		).join('\n');
		break;
	default:
		ret = item[focus_type];
	}
	return ret || '';
}

function onMessage(msg) {
	switch (msg.type) {
	// 应用新设置
	case 'update':
		unload();
	// 初始化扩展
	case 'init':
		insertCSS(msg.css);
		settings = msg.settings;
		data = msg.data;
		load();
		break;
	}
}

// 启动扩展
function initialize() {
	if (! stream || isPMPage() || isBrowsingPage()) return;
	// 与后台连接, 请求数据
	var port = ce.connect();
	port.onMessage.addListener(onMessage);
	port.onDisconnect.addListener(function () {
		// 当扩展停用时, 卸载扩展
		unload();
	});
}

// 加载
function load() {
	if (loaded) return;
	loaded = true;
	// 清空缓存
	flushCache();
	// 监听 DOM 树变化
	stream.addEventListener('DOMNodeInserted', onStreamInserted, false);
	// 对页面中已加载的 Timeline 进行处理
	processStream($$('#stream > ol'));
	// 实现双击被折叠消息后还原的功能
	delegate(function () {
		return getTagName(this) === 'li';
	}, 'dblclick', function () {
		recoverEliminated(this);
		return false;
	});
	var act = settings.flatStyleColorization ?
		'setAttribute' : 'removeAttribute';
	document.body[act]('fanatic-flat-style-colorization');
}

// 卸载
function unload() {
	if (! loaded) return;
	loaded = false;
	// 清空缓存
	flushCache();
	// 取消事件绑定
	stream.removeEventListener('DOMNodeInserted', onStreamInserted, false);
	forEach($$('#stream > ol'), function (ol) {
		ol.removeEventListener('DOMNodeInserted', onDOMNodeInserted, false);
	});
	// 还原处理
	forEach($$('#stream > ol > li'), recoverItem);
	forEach($$('[' + consts.hiddenAttr + ']'), showItem);
	// 去掉双击被折叠消息后还原的功能
	undelegateAll();
}

// 清空缓存
function flushCache() {
	cache = {};
}

// 判断某一具体条件是否满足
function judge(src_data, condition) {
	// 如果没有可用源数据供匹配, 则不继续分析, 而是
	//   当匹配逻辑为 "当所有条件满足时匹配" 或
	//   "当任一条件满足时匹配" 时, 认定为没有达成匹配
	// 或
	//   当匹配逻辑为 "当所有条件不满足时匹配" 或
	//   "当任一条件满足时不匹配" 时, 认定为达成匹配
	if (src_data == null) {
		return condition.contraryMatching;
	}

	var matched = false;

	switch (condition.type) {
	case 'keyword':
	case 'regexp':
	case 'wildcard':
		var re = prepareRegexp(condition.type, condition.rule);
		matched = re.test(src_data);
		break;

	case 'completeMatching':
		matched = (src_data + '') == (condition.rule + '');
		break;
	}

	// 如果匹配逻辑为 "当所有条件不满足时匹配" 或
	// "当任一条件满足时不匹配" 时, 颠倒匹配结果
	if (condition.contraryMatching)
		matched = ! matched;

	return matched;
}

// 分析消息
function analyseItem(item) {
	// 所有可供分析的项目名称
	var focuses = consts.filterBys;
	// 处理方法名称
	var measure;
	// 按照用户指定的顺序, 尝试匹配筛选器
	data.uidList.some(function (data_id) {
		// 筛选器对应的所有需满足条件
		var conditions = data[data_id];
		// 如果没有任何条件则视为匹配失败
		if (! conditions.length) return false;
		// 判断各条件是否满足
		var matched = ! conditions.some(function (condition) {
			// 读取供判断的数据源
			var src_data = getSourceData(item, condition.focus, condition.type);
			// 判断单个条件是否满足
			// 如果条件不满足, 则不再判断该筛选器的其他条件
			return ! judge(src_data, condition);
		});
		// 如果所有条件皆满足, 视为达成匹配
		if (matched) {
			// 根据 UID 查找这些条件所对应的原始筛选器
			var filter_uid = conditions[0].filterUID;
			var filter = getFilterByUID(filter_uid);
			// 确定处理方法
			measure = filter.measure;
			// 在消息上标记达成匹配的筛选器
			item.matchedFilter = filter;
		}
		// 若筛选器达成匹配, 则不再尝试匹配其他筛选器
		return matched;
	});
	return measure;
}

// 处理消息
function processItem(item) {
	// 简单判断 item 是否为消息
	if (getTagName(item) !== 'li') return;
	// 若分析过则忽略
	if (item.hasAttribute(consts.analysedAttr)) return;
	// 标记消息为已分析过, 避免重复处理
	item.setAttribute(consts.analysedAttr, '');
	// item 可能是 太空饭否++ 的 "展开回复/转发" 按钮
	// 直接忽略
	//if (isExpandingBtn(item)) return;

	// 消息内容 (元素)
	item.content = _('.content', item);
	if (! item.content) return;

	//item.avatar = _('.avatar', item);
	item.author = _('.author', item);
	if (item.author) {
		// 消息作者 ID
		item.id = getUserIdFromURL(item.author.href);
		// 消息作者昵称
		item.username = item.author.textContent;
	}
	// 客户端
	item.client = ((_('.method', item) || {}).textContent || '').substr(2);
	// 回复/转发 信息
	item.reply = (_('span.reply a', item) || {}).textContent;

	if (item.content) {
		// 读取消息正文中 @ 到的用户的昵称和 ID
		item.mentionedUsers = extractUsers(item);
		item.mentionedUsernames = item.mentionedUsers.map(function (user) {
			return user.username;
		});
		item.mentionedIds = item.mentionedUsers.map(function (user) {
			return user.id;
		});
	}

	// 分析 回复/转发 信息
	analyseReply(item);

	// 对该消息进行分析和处理
	var measure = analyseItem(item);
	if (measure && measures[measure]) {
		measures[measure].do(item);
		if (! item.isExpandedItem) {
			// 只对非 太空饭否++ 展开评论/回复插件
			// 所加载的消息进行下面的处理

			// 检查被过滤消息是否过多, 是则继续加载
			checkPercolations();
			// 修正消息被过滤导致的统计数字错误
			tryFixCount(item);
		}
	}
}

// 隐藏消息
function hideItem(item) {
	item && item.setAttribute(consts.hiddenAttr, '');
}

// 取消隐藏消息
function showItem(item) {
	item && item.removeAttribute(consts.hiddenAttr);
}

// 取消对消息的所有处理, 恢复到原始状态
function recoverItem(item) {
	item.removeAttribute(consts.analysedAttr);
	var processed = item.getAttribute(attr);
	if (processed === null) return;

	forIn(measures, function (measure) {
		if (measure.processed === processed)
			measure.undo(item);
	});

	var keys = [
		'author', 'id', 'username', 'content',
		'avatar', 'client', 'mentionedIds',
		'mentionedUsers', 'mentionedUsernames',
		'reply', 'replyUsername', 'repostUsername',
		'isExpandedItem', 'matchedFilter'
	];
	keys.forEach(function (key) {
		delete item[key];
	});
}

// 恢复被折叠的消息
function recoverEliminated(item) {
	// 确认消息是否被折叠过
	if (item.getAttribute(attr) === measures.eliminate.processed) {
		measures.eliminate.undo(item);
	}
}

// 分析 回复/转发 信息
function analyseReply(item) {
	if (! item.reply) return;
	// 缓存分析结果
	var replies = cache.replies = cache.replies || {};
	var reply = replies[item.reply] = replies[item.reply] || {};

	// 若存在则读取该消息回复用户的昵称
	reply.replyUsername = reply.replyUsername ||
		(item.reply.match(/^给(.+)的回复(\(查看\))?/) || [])[1];

	// 若存在则读取该消息转发用户的昵称
	reply.repostUsername = reply.repostUsername || (! reply.replyUsername &&
		(item.reply.match(/^转自(.+)(\(查看\))?$/) || [])[1]);

	item.replyUsername = reply.replyUsername;
	item.repostUsername = reply.repostUsername;
}

// 处理 Timeline
function processStream(ol) {
	ol = typeof ol.length == 'number' ? ol[0] : ol;
	if (! ol) return;
	ol.addEventListener('DOMNodeInserted', onDOMNodeInserted, false);
	forEach($$('li', ol), processItem);
}

function onDOMNodeInserted(e) {
	processItem(e.target);
}

function onStreamInserted(e) {
	processStream(e.target);
}

function getUserIdFromURL(link) {
	return decodeURIComponent(
		searchStr(link, 'after', 'http://fanfou.com/')
	);
}

function extractUsers(item) {
	var re = /@<a href="(http:\/\/fanfou\.com)?\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
	var result, users = [];
	var html = item.content.innerHTML;
	while (result = re.exec(html)) {
		users.push({
			id: decodeURIComponent(result[2]),
			username: result[3]
		});
	}
	return users;
}

// 修正对消息的过滤处理导致的未读消息数量统计错误的问题
// 这个函数使用了 throttle 技术, 不会在每次被调用后立即执行
// 所以虽然会被多次调用, 但每次加载页面后只会被调用一次
var tryFixCount = throttle(function () {
	// 确认有可以显示的未读消息
	if (! $$('li.buffered').length) return;
	var tl_count = $('timeline-count');
	if (! tl_count) return;
	// 获取未被过滤处理的未读消息
	var buffered = $$(
		'#stream li.buffered' +
		':not([' + consts.hiddenAttr + '])' +
		':not([' + attr + '="' + measures.eliminate.processed + '"])'
	);
	// 由于 太空饭否 的 bug, 虽然用户点击了 "显示最新 X 条未读消息",
	// 部分未读消息偶尔会有显示后仍然带有 "buffered" 类名的问题,
	// 需要把这部分消息过滤掉
	// 我们只需要统计真正没有显示 (即没有被读过)
	// 且没有被过滤处理的消息数量
	var hidden_buffered = [];
	forEach(buffered, function (item) {
		if (getStyle(item).display == 'none') {
			hidden_buffered.push(item);
		}
	});
	var count = hidden_buffered.length;
	// 修正 Timeline 上方的未读消息提示条
	tl_count.textContent = count;
	// 修正窗口标题
	document.title = document.title.replace(/^\(\d+\) /,
		count ? '(' + count + ') ' : '');
	if (! count) {
		// 如果没有未经过滤处理的未读消息,
		// 隐藏 Timeline 上方的未读消息提示条
		$('timeline-notification').style.display = 'none';
	}
}, 16);

// 根据 UID 获取筛选器
function getFilterByUID(uid) {
	var filters = cache.filters = cache.filters || {};
	if (! filters[uid]) {
		// 没有缓存这个筛选器, 需要查找
		settings.filters.some(function (filter) {
			if (filter.uid === uid) {
				filters[uid] = filter;
				return true;
			}
		});
	}
	return filters[uid];
}

// 从缓存读取或生成正则表达式
function prepareRegexp(type, rule) {
	var regexps = cache.regexps = cache.regexps || {};
	regexps[type] = regexps[type] || {};
	if (! regexps[type][rule]) {
		// 缓存中不存在, 需要生成
		var func;
		if (type === 'keyword')
			func = keyword2regexp;
		else if (type === 'wildcard')
			func = wildcard2regexp;
		else if (type === 'regexp')
			func = string2regexp;
		else
			throw new Error('type: ' + type + ' rule: ' + rule);
		regexps[type][rule] = func(rule.trim());
	}
	return regexps[type][rule];
}

// 将关键字文本转换为正则表达式
function keyword2regexp(str) {
	return new RegExp(
		str.replace(/(\.|\?|\^|\$|\*|\+|\{|\}|\[|\]|\(|\)|\\)/g, '\\$1'),
		'i'
	);
}

// 由字符串生成正则表达式
function string2regexp(str) {
	// 字符串既可以是类似 "/a+bc/i" 的完整正则表达式,
	// 也可以仅仅是正则表达式的主体部分, 如 "a+bc"
	var re = /^\/([^\/]+)\/([igm]*)$/;
	if (re.test(str)) {
		var result = str.match(re);
		return new RegExp(result[1], result[2] || '');
	}
	return new RegExp(str, 'i');
}

// 将通配符文本转换为正则表达式
function wildcard2regexp(str) {
	return new RegExp(
		str.
		replace(/(\.|\||\+|\{|\}|\[|\]|\(|\)|\\)/g, '\\$1').
		replace(/\?/g, '.').
		replace(/\*/g, '.*'),
		'i'
	);
}

// 模拟点击 "更多", 继续加载消息
function loadMore() {
	var more = $('pagination-more');
	if (more && ! more.classList.contains('loading'))
		emulateClick(more, true);
}

// 模拟鼠标点击元素
function emulateClick(elem, canBubble) {
	var e = document.createEvent('MouseEvents');
	e.initMouseEvent('click', canBubble === true, true)
	elem.dispatchEvent(e);
}

// 事件代理
function delegate(filter, type, listener, notSearch) {
	// 代理监听器
	var proxy = function(e) {
    var target = e.target;
    do {
      if (filter.call(target, e) === true) {
        if (listener.call(target, e) === false)
          e.preventDefault();
        return;
      }
    } while (
			// 当 notSearch 不为 true 时,
			// 沿 DOM 树向上查找可能符合条件的元素
			! notSearch &&
			// 若事件被阻止冒泡, 则停止查找
			! e.cancelBubble &&
			// 沿 DOM 树的节点层级向上查找
			(target = target.parentNode) &&
			// 查找对象必须是元素节点
			target.tagName
		);
  }
	// 将代理监听器缓存起来
	proxies.push({
		type: type,
		proxy: proxy
	});
	// 绑定事件
	addEventListener(type, proxy, false);
}

// 取消绑定所有代理事件监听器
function undelegateAll() {
	while (proxies.length) {
		var item = proxies.shift();
		removeEventListener(item.type, item.proxy, false);
	}
}

// 插入 CSS 代码
function insertCSS(css) {
	var id = consts.idPrefix + 'style';
	var style = $(id);
	if (style) {
		// 删除已插入的 CSS 代码
		removeElem(style);
	}
	style = document.createElement('style');
	style.textContent = css;
	style.id = id;
	document.documentElement.appendChild(style);
}

// 从 DOM 树删除元素
function removeElem(elem) {
	if (! elem) return;
	elem.parentNode.removeChild(elem);
	elem.innerHTML = elem.textContent = '';
}

// 删除展开消息
function removeReplies(item) {
	if (getTagName(item) !== 'li') return;
	var next = item.nextSibling;
	while (next && getTagName(next) === 'li' &&
		next.classList.contains('reply')) {
		item = next;
		next = next.nextSibling;
		removeElem(item);
	}
}

// 判断是否为 太空饭否++ 的 "展开评论/转发" 按钮
function isExpandingBtn(item) {
	if (! item || ! item.classList.contains('reply'))
		return false;
	var classes = ['more', 'notavail', 'waiting', 'hide'];
	var is_expanding_btn = classes.some(
		function (cls) {
			return item.classList.contains(classes);
		}
	);
	return is_expanding_btn;
}

// 判断是否为 太空饭否++ 展开评论/回复插件所加载的消息
function isExpandedItem(item) {
	return item.classList.contains('reply') &&
		item.getAttribute('expended') === 'expended';
}

// 获取元素的小写标签名
function getTagName(elem) {
	return elem != null && elem.tagName != null &&
		elem.tagName.toLowerCase() || '';
}

// 读取元素的当前样式
function getStyle(elem) {
	return document.defaultView.getComputedStyle(elem, null);
}

// 启动
initialize();