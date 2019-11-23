// todo
// 过滤带图片消息

// 读取本地数据
var ext_config = chrome.app.getDetails();
var content_scripts = ext_config.content_scripts[0];
var local_css = loadFile(content_scripts.css[0]);

// 全局变量
var cached_css, data;
var ports = {};

// 初始化
function initialize() {
	// 补全过滤器缺失的属性
	var filters = settings.filters;
	filters.forEach(function (filter, i) {
		filters[i] = completeFilter(filter);
	});
	settings.filters = filters;
	saveSettings(settings);

	// 初始化缓存
	buildCSSCache();
	buildDataCache();

	// 在已存在的饭否页面里加载 Fanatic
	connectExistingTabs();
}

function checkURL(url) {
	if (typeof url != 'string') return false;
	var { hostname, pathname } = parseURL(url);
	// 现在已经不知道这个 http://fanfou.com/home.2 是什么页面了，保留
	return hostname === 'fanfou.com' && pathname !== '/home.2';
}

function loadFile(path) {
	var xhr = new XMLHttpRequest;
	xhr.open('GET', path, false);
	xhr.send(null);
	return xhr.responseText;
}

function buildCSSCache() {
	cached_css = [local_css];

	// 筛选出所有染色过滤器用到的颜色
	var rgba_colors = settings.filters.
		filter(function (filter) {
			return filter.measure === 'colorize' &&
				Array.isArray(filter.bgColor) &&
				filter.bgColor.length === 3;
		}).
		map(function (filter) {
			return filter.bgColor;
		});

	var colorized = '#stream li[fanatic-processed="colorized"]';
	var light_colorized = '#stream li.light[fanatic-processed="colorized"]';
	rgba_colors.forEach(function (color) {
		var data_attr = '[fanatic-bg-color="' + color.join(', ') + '"]';
		cached_css.push(colorized + data_attr + ',');
		cached_css.push(light_colorized + data_attr + ',');
		cached_css.push(light_colorized + data_attr + ':hover {');
		cached_css.push(
			'	background-color: rgba(' +
			color.concat(.2).join(', ') +
			') !important;'
		);
		cached_css.push('}');
	});

	cached_css = cached_css.join('\n');
}

function buildDataCache() {
	data = {}; // 清空所有已缓存的数据
	// 所有可供过滤项目的名称, 如: id、content
	var focuses = consts.filterBys;
	// 按照用户指定的顺序, 记录启用的筛选器的 UID
	var uid_list = data.uidList = [];
	settings.filters.forEach(function (filter) {
		if (! filter.enabled) return;
		uid_list.push(filter.uid);
		// 该筛选器的所有条件构成的数组
		// 只有这些条件全部满足(或不满足)时才达成匹配
		var conditions = data[filter.uid] = [];
		focuses.forEach(function (focus) {
			forIn(filter[focus], function (iterator, key) {
				conditions.push({
					focus: focus, // 筛选项目的名称
					type: key, // 匹配方法
					rule: iterator, // 匹配规则
					// 是否使用反向匹配
					contraryMatching: filter.contraryMatching,
					filterUID: filter.uid
				});
			});
		});
		if (! filter.matchesWhenAllConditionsMet) {
			// 若任一条件满足(或不满足)即匹配
			// 那么把原来的一个数组拆分为多个数组
			// 这样它们可以互相独立地匹配
			conditions.forEach(function (condition, i) {
				var new_uid = filter.uid + '-' + i;
				data[new_uid] = [condition];
				uid_list.push(new_uid);
			});
			uid_list.splice(uid_list.indexOf(filter.uid), 1);
			delete data[filter.uid];
		}
	});
}

// 将设置项的变动立即应用到页面
function applySettings() {
	var old_settings = settings;
	settings = getSettings();
	if (JSON.stringify(old_settings) ===
		JSON.stringify(settings)) return;

	buildCSSCache();
	buildDataCache();

	broadcastSettings();
}

// 将设置广播出去
function broadcastSettings() {
	forIn(ports, function (port, name) {
		if (name.indexOf('port_') !== 0)
			return;
		port.postMessage(
			getCompleteMsg('update')
		);
	});
}

// 生成消息
function getCompleteMsg(type) {
	return {
		type: type,
		settings: settings,
		css: cached_css,
		data: data
	};
}

// 在已打开的页面里加载扩展
function connectExistingTabs() {
	// 异步化脚本加载
	chrome.tabs.query({}, function (tabs) {
		var js_list = content_scripts.js;
		tabs.forEach(function (tab) {
			if (tab && checkURL(tab.url)) {
				(function loadJS(i) {
					chrome.tabs.executeScript(tab.id, {
						file: js_list[i++]
					}, function() {
						if (js_list[i]) loadJS(i);
					});
				})(0);
			}
		});
	});
}

// 在所有页面显示 PageAction (仅用于测试)
function _showPageAction() {
	chrome.tabs.query({}, function (tabs) {
		tabs.forEach(function (tab) {
			if (tab && tab.id) {
				chrome.pageAction.show(tab.id);
			}
		});
	});
}

// 监听页面脚本连接
chrome.extension.onConnect.addListener(function (port) {
	var tab_id = port.sender.tab.id;
	var port_id = 'port_' + tab_id;
	// 将 port 保存起来, 以供广播之用
	ports[port_id] = port;

	// 页面关闭后将保存的 port 清理出去
	port.onDisconnect.addListener(function () {
		delete ports[port_id];
	});

	// 请求加载扩展
	port.postMessage(
		getCompleteMsg('init')
	);
	// 在地址栏显示 PageAction
	chrome.pageAction.show(tab_id);
});

// 保持 PageAction 显示
chrome.tabs.onUpdated.addListener(function (_, _, tab) {
	if (checkURL(tab.url))
		chrome.pageAction.show(tab.id);
});

// 启动
initialize();
