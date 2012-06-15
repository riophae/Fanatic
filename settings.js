// 清空数据
function reset() {
	if (! location.href.indexOf('chrome-extension://'))
		localStorage.clear();
}

// 读取设置
function getSettings() {
	var settings = localStorage.getData(consts.stKey);
	settings = fixSettings(settings);
	return settings;
}

// 保存设置
function saveSettings(settings) {
	// 将版本号一并保存, 提高代码兼容性
	localStorage.setData(consts.stKey, settings);
	return settings;
}

function fixSettings(settings) {
	if (! settings) {
		settings = mixin({}, default_settings);
		saveSettings(default_settings, true);
	} else {
		complete(settings, default_settings);
	}
	settings.version = getVersion();
	return settings;
}

// 获取缺省筛选器
function getDefaultFilter() {
	return {
		uid: '',
		type: 'colorization',
		id: {},
		bgColor: [],
		username: {},
		content: {},
		client: {},
		mentionedId: '',
		mentionedUsername: '',
		replyUsername: {},
		repostUsername: {},
		extraOperations: [],
		// 是否使用反向匹配
		contraryMatching: false,
		// 是否仅当筛选器的所有条件满足时达成匹配
		matchesWhenAllConditionsMet: true,
		enabled: true,
		// 是否受保护 (受保护的筛选器禁止删除)
		protected: false
	};
}

function complete(object, template) {
	forIn(template, function (item, key) {
		if (object[key] === undefined || object[key] === null)
			object[key] = template[key];
	});
}

// 补全筛选器
function completeFilter(filter) {
	var default_filter = getDefaultFilter();
	complete(filter, default_filter);
	if (! filter.measure) {
		switch (filter.type) {
		case 'colorization':
			filter.measure = 'colorize';
			break;
		case 'percolation':
			filter.measure = 'eliminate';
			break;
		}
	}
	return filter;
}

// 供染色筛选器使用的备选颜色
var ordered_colors = [
	[102, 51, 0],
	[139, 0, 0],
	[139, 69, 19],
	[205, 38, 38],
	[255, 0, 0],
	[255, 69, 0],
	[205, 112, 84],
	[205, 16, 118],
	[255, 62, 150],
	[205, 96, 144],
	[205, 183, 181],
	[255, 127, 0],
	[0, 102, 255],
	[70, 130, 180],
	[0, 191, 255],
	[0, 245, 255],
	[142, 229, 238],
	[255, 215, 0],
	[139, 121, 94],
	[105, 105, 105],
	[156, 156, 156],
	[193, 205, 193],
	[184, 134, 11],
	[255, 255, 0],
	[0, 0, 139],
	[49, 79, 79],
	[0, 100, 0],
	[0, 139, 0],
	[0, 139, 139],
	[144, 238, 144],
	[34, 139, 34],
	[107, 142, 35],
	[118, 238, 0],
	[192, 255, 62],
	[255, 0, 255],
	[147, 112, 219]
];

// 缺省设置
var default_settings = {
	version: getVersion(),
	uid: 0,
	autoLoad: true,
	loadDelay: 1000,
	flatStyleColorization: false,
	// 预设筛选器
	filters: [ {
		// 为与饭否官方账号有关的消息染色
		uid: 'fanfou',
		// 禁止删除
		protected: true,
		// 染色
		type: 'colorization',
		measure: 'colorize',
		// 颜色
		bgColor: [0, 102, 255],
		// 匹配作者 ID 为 "fanfou" 的消息
		id: {
			// 使用 "完全匹配" 方法匹配 (即完全相等时视为满足条件)
			completeMatching: 'fanfou'
		},
		// 匹配 @ 了 "fanfou" 的消息
		mentionedIds: {
			completeMatching: 'fanfou'
		},
		// 匹配回复 "饭否" 的消息
		replyUsername: {
			completeMatching: '饭否'
		},
		// 匹配转发 "饭否" 的消息
		repostUsername: {
			completeMatching: '饭否'
		},
		// 以上任意条件满足时达成匹配
		matchesWhenAllConditionsMet: false
	}, {
		// 为锐风的消息染色
		uid: 'ruif',
		type: 'colorization',
		measure: 'colorize',
		bgColor: [139, 69, 19],
		id: {
			completeMatching: 'ruif'
		}
	}, {
		// 屏蔽通过 "街旁" 发送的消息
		uid: 'unwelcome_clients',
		// 过滤筛选器
		type: 'percolation',
		// 对消息进行折叠显示处理
		measure: 'eliminate',
		client: {
			keyword: '街旁'
		}
	} ]
};

// 加载设置
var settings = getSettings();
