mixin(consts, {
	flId: '#filters-list',
	optionTextInputSel: 'td > input[type="text"]',
	desc: {
		'colorization': '染色',
		'percolation': '过滤'
	},
	stFileName: 'Fanatic.bak',
	commonStIds: [
		'flat-style-colorization',
		'auto-load',
		'load-delay'
	]
});

var BlobBuilder = self.BlobBuilder || self.WebKitBlobBuilder || (function(view) {
	var
	FakeBlobBuilder = function () {},
	FBB_proto = FakeBlobBuilder.prototype = [];
	FBB_proto.append = function (data) {
		this.push(data);
	};
	FBB_proto.getBlob = function (type) {
		if (!arguments.length) {
			type = "application/octet-stream";
		}
		return new Blob([ this.join("") ], { type: type });
	};
	FBB_proto.toString = function () {
		return "[object BlobBuilder]";
	};
	return FakeBlobBuilder;
})(self);
var bg_win = chrome.extension.getBackgroundPage();

// 扩展 Zepto, 增加获取完整高度的方法
$.fn.fullHeight = function () {
	var $self = this.first();
	var transition = $self.css('-webkit-transition');
	$self.css('-webkit-transition', 'none');
	var current_height = $self.height();
	var full_height = $self.css('height', 'auto').height();
	$self.height(current_height);
	$self.css('-webkit-transition', '');
	if ($self.css('-webkit-transition') !== transition)
		$self.css('-webkit-transition', transition);
	return full_height;
}

// 控件库
var UI = {
	icon: function (text) {
		return $('<span />').addClass('icon');
	},
	title: function (text) {
		return $('<h3 />').
			append(UI.triangle()).
			append(
				$('<font />').
				addClass('filter-title').
				text(text)
			);
	},
	triangle: function () {
		return $('<font class="triangle icon"></font>');
	},
	table: function () {
		var $table = $('<table />');
		var $tbody = $('<tbody />').appendTo($table);
		return $table;
	},
	tbody: function ($tbody, data) {
		for (var i = 0; i < data.length; i++) {
			(
				$.zepto.isZ(data[i]) ?
					data[i] : UI.tr(data[i])
			)
			.appendTo($tbody);
		}
		return $tbody;
	},
	tr: function (data) {
		var $tr = $('<tr />'), $td, items;
		if (data instanceof Array) {
			items = data;
		} else {
			items = data.items;
			processUIOptions($tr, data);
		}
		for (var m = 0; m < items.length; m++) {
			$td = $('<td />').append(items[m]).appendTo($tr);
			if (items.length < 3 && m === items.length -1) {
				$td.attr('colspan', 4 - items.length);
			}
		}
		return $tr;
	},
	select: function (options, items) {
		var $select = $('<select />');
		if (arguments.length === 1) {
			items = options;
		} else {
			processUIOptions($select, options);
		}
		items.forEach(function (item) {
			$('<option />').
			prop('value', item.value).
			text(item.text).
			appendTo($select);
		});
		return $select;
	},
	selectMatchingMethod: function () {
		return UI.select({
				className: 'matching-method'
			}, [
				{ text: '关键字', value: 'keyword' },
				{ text: '完全匹配', value: 'completeMatching' },
				{ text: '通配符', value: 'wildcard' },
				{ text: '正则表达式', value: 'regexp' }
			]);
	},
	textInput: function (options) {
		var $input = $('<input />').prop('type', 'text');
		processUIOptions($input, options);
		return $input;
	},
	textInputOptionItem: function (desc, type, callback) {
		var $option_item = UI.tr([
			desc,
			UI.selectMatchingMethod(),
			UI.textInput({ className: type })
		]);
		type && $option_item.addClass(type + '-options');
		callback && callback($option_item);
		return $option_item;
	},
	optionTitle: function(desc, tip) {
		return $('<h5 />').
			text(desc).
			prop('title', tip);
	},
	checkbox: function (options) {
		return $('<label />').
			append(
				processUIOptions(
					$('<input />').
					prop('type', 'checkbox').
					prop('value', options.value),
					options
				)
			).
			append(options.text);
	},
	colorPicker: function () {
		var $picker = $('<input />').
			attr('type', 'text').
			addClass('color-picker');
		setTimeout(function () {
			$picker.colorPicker();
		}, 0);
		return $picker;
	},
	dataTag: function (tag) {
		return $('<span />').
			addClass('data-tag', tag).
			text(tag);
	},
	onoff: function () {
		return UI.icon().
			addClass('onoff');
	},
	removeFilter: function () {
		return UI.icon().
			addClass('remove-filter').
			text('删除');
	},
	hidden: function (name) {
		return $('<input />').
			attr('type', 'hidden').
			addClass(name);
	}
};

function bindEvents() {
	$('.apply-settings').
	click(applySettings);

	$('#output-settings').
	click(saveSettingsToFile);

	$('#reset-settings').
	click(resetSettings);

	$('#add-colorization-filter').
	click(addColorizationFilter);

	$('#add-percolation-filter').
	click(addPercolationFilter);

	var $body = $('body');
	$(window).
	on('dragover', function (e) {
		if ($(e.target).hasClass('drag-source'))
			return;
		e.preventDefault();
	}).
	on('drop', function (e) {
		$body.removeClass('drag-dragging');
		$('.drag-source').removeClass('drag-source');
	}).
	on('mouseup', function (e) {
		if (e.button !== 0) return;
		if (! $('.drag-dragging').length) return;
		var classes = ['drag-source', 'drag-dragging'];
		$(
			classes.
			map(function (c) {
				return '.' + c;
			}).
			join(', ')
		).
		removeClass(
			classes.join(' ')
		);
	});

	$('#common-setting-list').
	on('drop', function (e) {
		var file = e.dataTransfer.files[0];
		file && readSettingsFromFile(file);
	}).
	on('dragover drop', function (e) {
		e.preventDefault();
	});
}

function initFiltersList() {
	var $filters_list = $('#filters-list');
	var filters = getAllFilters();
	filters.forEach(function (filter) {
		renderData(
			renderFilterUI(
				createFilterUI(filter)
			)
		);
	});
	initDirections();
}

// 初始化指南
function initDirections() {
	var directions = [
		'每条消息最多只能被一组筛选器匹配, ' +
		'排列靠前的筛选器将会优先匹配. ' +
		'拖拽筛选器可以自由排序.',

		'ID 指个人页面地址最后的一部分. 如 ' +
		'<strong>http://fanfou.com/fanfou</strong> ' +
		'对应 ID 为 <strong>fanfou</strong>.',

		'如果需精确匹配某条消息中是否 @ 了某个 ID, ' +
		'请将 "@ID" 一项的匹配方法设置为 <strong>"正则表达式"</strong>, ' +
		'匹配规则设置为 <strong>/^id$/m</strong>.',

		'当消息内容的匹配方法设置为 <strong>"正则表达式"</strong> 时, ' +
		'将会使用 HTML 源码作为匹配源文本.',

		'关键字模式可以使用 <strong>"|"</strong> 分割多个关键字; ' +
		'通配符模式可以使用 <strong>"?"</strong> 匹配单个字符, ' +
		'使用 <strong>"*"</strong> 匹配零个或多个字符. ' +
		'除 "完全匹配" 模式外, 均可使用 <strong>^$</strong> 匹配开头和结束的位置.',

		'如果想要屏蔽特定消息, 请新建 <strong>"过滤"</strong>, 并根据情况进行配置.' +
		'如果希望不显示这些消息, 可将处理方式设定为 ' +
		'<strong>"隐藏"</strong> 或 <strong>"清除"</strong>. ' +
		'其中 "清除" 将会彻底把消息从网页删除掉, ' +
		'而 "隐藏" 不会. 前者更节约资源.',

		'只显示特定好友消息 (好友分组) 的设置方法: ' +
		'新建 <strong>"过滤"</strong>, 将 ' +
		'<strong>"作者ID"</strong> 或 <strong>"作者昵称"</strong> ' +
		'项的匹配方法设置为 <strong>"关键字"</strong>, ' +
		'匹配规则设置为由 <strong>"|"</strong> 连接的多个 ID 或昵称; ' +
		'匹配逻辑设置为 <strong>"当所有条件不满足时匹配"</strong>; ' +
		'处理方式设置为 <strong>"清除"</strong>. ' +
		'并请<strong>禁用</strong>其他无关的筛选器. ' +
		'请尽可能多设置 ID 或昵称, 以减少资源消耗.',

		'彻底屏蔽某用户的设置方法: ' +
		'新建 <strong>"过滤"</strong>, 将 ' +
		'<strong>作者昵称</strong></strong>(或 ID, 可以避免因该用户改名导致失效)、' +
		'<strong>@昵称</strong>(或 @ID)、' +
		'<strong>回复昵称</strong>、<strong>转发昵称</strong> ' +
		'的匹配方法设置为 <strong>"完全匹配"</strong>, ' +
		'匹配规则设置为<strong>将屏蔽用户的昵称或 ID</strong>, ' +
		'匹配逻辑设置为 <strong>"当任一条件满足时匹配"</strong>, ' +
		'处理方式设置为 <strong>"隐藏"</strong> 或 <strong>"清除"</strong>. ' +
		'如此设置后, 所有该用户消息、提到或转发或回复了该用户的消息都不会显示.',

		'只显示原创消息的设置方法: ' +
		'新建 <strong>"过滤"</strong>, 将 ' +
		'<strong>转发昵称</strong> ' +
		'的匹配方法设置为 <strong>"通配符"</strong>, ' +
		'匹配规则设置为 <strong>"?"</strong>, ' +
		'将 <strong>消息内容</strong> 的匹配方法设置为 ' +
		'<strong>"关键字"</strong>, 匹配规则设置为 ' +
		'<strong>"转@|RT@|RT @|RT:"</strong>, ' +
		'匹配逻辑设置为 <strong>"当任一条件满足时匹配"</strong>.',

		'如果希望不论在何种情况下都显示某个人 (或多个人) 的消息,' +
		'请新建 <strong>"过滤"</strong> ("染色" 亦可), ' +
		'将处理方式设定为 <strong>"保护"</strong>, ' +
		'保持其启用且处在靠前的位置.',

		'被折叠处理的消息可以双击后还原.',

		'加载新消息后, 若被过滤处理的消息超过 5 条则自动继续加载, ' +
		'直到总共加载的未过滤处理消息超过 20 条为止.',

		'被过滤掉 (隐藏/清除/折叠) 的消息不会计入 ' +
		'窗口标题 / TL上方横条 的新消息数量提示的统计. ',

		'更多颜色请参考' +
		'<a href="https://www.colordic.org" target="_blank" class="link">' +
		'原色大辞典</a>.'
	];
	$('<li />').
	prop('id', 'directions').
	append(UI.title('指南')).
	append(
		$('<ol />').
		prop('id', 'directions-list').
		html(
			'<li>' +
			directions.join('</li><li>') +
			'</li>'
		)
	).
	appendTo(
		$(consts.flId)
	);
}

// 配置选色版插件
function initColorPicker() {
	$.fn.colorPicker.defaults.colors =
		ordered_colors.map(function (color) {
			return color && rgb2hex(color).substr(1);
		});
}

// 保存设置, 并将所有筛选器设置立即应用到页面
function applySettings() {
	saveAllFilterData();
	saveCommonSettings();
	bg_win.applySettings();
}

function resetSettings() {
	if (! confirm('确定要清除所有设置吗? 操作将无法恢复.'))
		return;
	cancelAutoSave();
	bg_win.reset();
	bg_win.location.reload();
	location.reload();
}

function cancelAutoSave() {
	$('.apply-settings').off('click');
}

function saveCommonSettings() {
	var settings = getSettings();
	consts.commonStIds.forEach(function (id) {
		var key = $.zepto.camelize(id);
		var $option = $('#' + id);
		if ($option.is('[type="checkbox"]'))
			settings[key] = $option.prop('checked');
		else if ($option.is('[type="number"]'))
			settings[key] = parseInt($option.val(), 10);
	});
	saveSettings(settings);
	return settings;
}

function loadCommonSettings() {
	var settings = getSettings();
	consts.commonStIds.forEach(function (id) {
		var key = $.zepto.camelize(id);
		var $option = $('#' + id);
		if ($option.is('[type="checkbox"]'))
			$option.prop('checked', settings[key]);
		else if ($option.is('[type="number"]'))
			$option.val(settings[key]);
	});
}

function verifySettings(settings) {
	if (! settings) return false;
	var list = ['version', 'filters'];
	return ! list.some(function (item) {
		return settings[item] == null;
	});
}

function saveSettingsToFile() {
	saveAllFilterData();
	var settings = getSettings();
	var text = encrypt(settings);
	var bb = new BlobBuilder;
	bb.append(text);
	var blob = bb.getBlob('text/plain');
	saveAs(blob, consts.stFileName);
}

function readSettingsFromFile(file) {
	if (! confirm('确定要从文件加载设置吗?'))
		return;
	var fr = new FileReader;
	fr.onload = function (e) {
		var text = fr.result;
		var settings;
		try {
			settings = decrypt(text);
		}
		catch (e) {
			alert('从文件读取数据失败.');
			return;
		}
		if (verifySettings(settings)) {
			if (! confirm('所有设置将被覆盖. 确定要继续吗?'))
				return;
			cancelAutoSave();
			saveSettings(settings);
			bg_win.applySettings();
			alert('设置导入成功!');
			location.reload();
		} else {
			alert('非法文件.');
		}
	}
	fr.readAsText(file);
}

function reverseString(text) {
	return text.split('').reverse().join('');
}

function encrypt(text) {
	text = JSON.stringify(text);
	text = escape(text);
	text = reverseString(text);
	return text;
}

function decrypt(text) {
	text = reverseString(text);
	text = unescape(text);
	return JSON.parse(text);
}

// 获取筛选器中某一条件的具体参数
function getData(filter, key) {
	for (var i in filter[key]) {
		if (filter[key].hasOwnProperty(i)) {
			return {
				matchingMethod: i,
				rule: filter[key][i]
			};
		}
	}
	return {
		matchingMethod: 'completeMatching',
		rule: ''
	};
}

// 获取匹配方法
function getMatchingLogic(filter) {
	if (filter.matchesWhenAllConditionsMet) {
		return filter.contraryMatching ?
			'mode4' : 'mode1';
	}
	return filter.contraryMatching ?
		'mode3' : 'mode2';
}

// 获取所有筛选器
function getAllFilters() {
	return getSettings().filters;
}

// 将所有筛选器数据写入存储
function saveAllFilters(filters) {
	var settings = getSettings();
	settings.filters = filters;
	saveSettings(settings);
}

// 查找并处理筛选器
function handleFilter(uid, callback) {
	var filters = getAllFilters();
	var len = filters.length;
	while (len--) {
		if (filters[len].uid === uid) {
			len++;
			break;
		}
	}
	return callback(filters, --len);
}

// 根据 UID 获取筛选器
function getFilter(uid) {
	return handleFilter(uid, function (filters, i) {
		return filters[i] ?
			completeFilter(filters[i]) : null;
	});
}

// 添加染色筛选器
function addColorizationFilter(e) {
	var filter = getDefaultFilter();
	filter.type = 'colorization';
	filter.measure = 'colorize';
	filter.bgColor = getRandomColor();
	createFilter(filter);
}

// 添加过滤筛选器
function addPercolationFilter(e) {
	var filter = getDefaultFilter();
	filter.type = 'percolation';
	filter.measure = 'eliminate';
	createFilter(filter);
}

// 通过筛选器数据获取对应 DOM 对象
function getUIFromFilter(filter) {
	return filter && $('#filter-' + filter.uid) || [];
}

// 从 DOM 对象查找对应的筛选器数据对象
function getFilterFromUI($filter) {
	return $filter && $filter.length &&
		getFilter($filter.data('filter-uid')) || null;
}

// 生成一个未被使用的随机颜色
function getRandomColor() {
	var max = ordered_colors.length - 1;
	var colors_in_use = [];

	// 读取当前所有筛选器参数
	getAllDataFromUI().
	forEach(function (filter) {
		var color = filter.bgColor;
		if (! color || ! color.length) return;
		// 不能直接在数组中查找对象,
		// 否则即便参数相同也无法匹配
		color = JSON.stringify(color);
		if (colors_in_use.indexOf(color) === -1)
			colors_in_use.push(color);
	});

	// 从备选颜色中随机选择一个颜色
	// 且保证其未被使用 (除非所有颜色都已用过)
	var i, new_color;
	do {
		i = Math.floor(
			Math.random() * max
		);
		color = JSON.stringify(
			ordered_colors[i]
		);
	} while (
		colors_in_use.indexOf(color) > -1 &&
		colors_in_use.length < ordered_colors.length - 1
	);

	return JSON.parse(color);
}

// 设置染色筛选器的颜色
function setColor(filter, $filter, onchange) {
	if (! filter.bgColor) return;
	if (! filter.bgColor.length) return;

	// 将数据保存在 DOM 对象上, 方便读取
	$filter.
	data('filter-bgColor', filter.bgColor);

	// 设置输入框的值
	$filter.
	find('.color-picker').
	val(
		rgb2hex(filter.bgColor)
	).
	// 这里使用 each 的目的不是遍历
	// 而是将选中的元素传入函数
	each(function () {
		// 若 onchange 不为 true
		// 触发 change 事件,
		onchange || $(this).trigger('change');
	});
}

// 更新所有筛选器的 Tags
function updateAllTags() {
	getAllFilterUIs().
	each(function () {
		updateTags($(this));
	});
}

function updateTags($filter) {
	// 当前选中的筛选器不需要显示 Tags, 所以忽略
	if ($filter.hasClass('current')) return;
	// 删除之前添加的 Tags
	$filter.find('.data-tag').remove();

	var tags = [];
	var $title = $filter.find('.filter-title');
	var data = getFilterDataFromUI($filter);

	consts.normalKeys.
	forEach(function (key) {
		// 从 UI 读取筛选器条件
		var item = getData(data, key);
		// Tags 只能是使用 "关键字" 或 "完全匹配" 匹配方法
		// 的条件的匹配规则
		switch (item.matchingMethod) {
		case 'keyword':
		case 'completeMatching':
			// 有时候用户会在多个条件里使用相同的匹配规则
			// 需要做去重处理
			if (item.rule && tags.indexOf(item.rule) < 0) {
				tags.push(item.rule);
			}
			break;
		}
	});

	// 最多从筛选器条件中读取 3 个 Tags
	tags.slice(0, 3).
	forEach(function (tag) {
		$title.after(UI.dataTag(tag));
	});

	// 如果是染色筛选器, 将颜色也作为 Tags 显示出来
	var color = data.bgColor;
	if (color && color.length) {
		var $color = UI.dataTag('');
		$color.addClass('color');
		$color.css('background', rgb2hex(color));
		$title.after($color);
	}
}

// 从 UI 读取筛选器的某一条件
function getDataFromUI($filter, key) {
	var value = $filter.
		find('.' + key).
		val();
	// 清理多余的空格
	value = value && (value + '').trim();
	var method = value && $filter.
		find('.' + key + '-options .matching-method').
		val();
	return value && method && {
		method: method,
		rule: value
	};
}

// 从 UI 获取某一筛选器的全部数据
function getFilterDataFromUI($filter) {
	var filter = {};

	['uid', 'type', 'bgColor'].
	forEach(function (key) {
		var value = $filter.data('filter-' + key);
		if (value) {
			filter[key] = $filter.data('filter-' + key);
		}
	});

	filter.protected = JSON.parse(
		$filter.data('filter-protected')
	);

	$filter.
	find('.measure').
	each(function () {
		filter.measure = $(this).val();
	});

	consts.normalKeys.
	forEach(function (key) {
		var data = getDataFromUI($filter, key);
		if (! data) return;
		filter[key] = {};
		filter[key][data.method] = data.rule;
	});

	var matching_logic = $filter.find('.matching-logic').val();
	filter.matchesWhenAllConditionsMet =
		['mode1', 'mode4'].indexOf(matching_logic) > -1;
	filter.contraryMatching =
		['mode3', 'mode4'].indexOf(matching_logic) > -1;

	var $onoff = $filter.find('.onoff');
	filter.enabled = $onoff.hasClass('on') &&
		! $onoff.hasClass('off');

	// 补全参数
	filter = completeFilter(filter);
	return filter;
}

// 获得所有筛选器的 UI
function getAllFilterUIs() {
	return $(consts.flId + ' > li:not(#directions)');
}

// 从 UI 读取所有筛选器的数据
function getAllDataFromUI() {
	var filters = [];
	getAllFilterUIs().
	each(function () {
		var filter = getFilterDataFromUI($(this));
		if (filter) filters.push(filter);
	});
	return filters;
}

// 读取并保存所有筛选器数据
function saveAllFilterData() {
	var filters = getAllDataFromUI();
	saveAllFilters(filters);
}

// 创建一个筛选器 UI
function createFilterUI(filter) {
	var $filter = $(
		$('<li />')[
			// 后面的 "removeClass" 实际上没有用
			filter.protected ? 'addClass' : 'removeClass'
		]('protected').
		addClass('filter').
		prop('id', 'filter-' + filter.uid).
		data('filter-uid', filter.uid).
		data('filter-type', filter.type).
		data('filter-protected',
			// 布尔值需转换为字符串才能缓存
			(filter.protected || false) + '').
		append(
			// 创建标题
			UI.title(consts.desc[filter.type]).
			append(UI.removeFilter()).
			append(UI.onoff().text('启用'))
		).
		append(
			// 创建主题部分的表格
			UI.table(0, 0)
		)
	);

	// 将 UI 插入到 DOM 树
	if ($('li.filter.current').length)
		$filter.insertAfter($('li.filter.current'));
	else if ($('#directions').length)
		$('#directions').before($filter);
	else
		$(consts.flId).append($filter);

	// 使其可以拖拽操作
	endraggable($filter);
	return $filter;
}

// 渲染筛选器 UI
function renderFilterUI(filter, $filter) {
	// 修正参数
	if (typeof filter != 'object') {
		filter = getFilter(filter);
		$filter = getUIFromFilter(filter);
	}
	else if ($.zepto.isZ(filter)) {
		$filter = filter;
		filter = getFilterFromUI(filter);
	}
	if (! filter) return $filter;

	// 需要插入到表格中的项目
	var render_options = [];

	// 表格标题
	render_options.push({
		className: 'table_title',
		items: ['项目', '匹配方法', '匹配规则']
	});

	// 各种设置项
	render_options = render_options.concat([
		UI.textInputOptionItem(
			UI.optionTitle('作者 ID', 'ID 指个人页面地址最后的一部分. \n如 http://fanfou.com/fanfou 对应 ID 为 fanfou.'),
			'id'
		),
		UI.textInputOptionItem(
			UI.optionTitle('作者昵称', '消息作者的用户名'),
			'username'
		),
		UI.textInputOptionItem(
			'消息内容', 'content',
			function ($option_item) {
				var $input = $option_item.find('input');
				$option_item.find('select').
				on('change', function (e) {
					$input.prop('placeholder', this.value == 'regexp' ?
						'将匹配消息的 HTML 代码' : '');
				});
			}
		),
		UI.textInputOptionItem('客户端', 'client'),
		UI.textInputOptionItem(
			UI.optionTitle('@ID', '消息中提到的用户的 ID'),
			'mentionedIds'
		),
		UI.textInputOptionItem(
			UI.optionTitle('@昵称', '消息中提到的用户的名字'),
			'mentionedUsernames'
		),
		UI.textInputOptionItem(
			UI.optionTitle('回复昵称', '消息下方 "给 XX 的回复" 提示里的用户名'),
			'replyUsername'
		),
		UI.textInputOptionItem(
			UI.optionTitle('转发昵称', '消息下方 "转自 XX" 提示里的用户名'),
			'repostUsername'
		),
		[
			'匹配逻辑',
			UI.select([
				{ text: '当所有条件满足时匹配', value: 'mode1' },
				{ text: '当任一条件满足时匹配', value: 'mode2' },
				{ text: '当所有条件不满足时匹配', value: 'mode3' },
				{ text: '当任一条件不满足时匹配', value: 'mode4' }
			]).
			addClass('matching-logic')
		]
	]);

	switch (filter.type) {
	case 'percolation':
		render_options.push([
			'处理方式',
			UI.select([
				{ text: '折叠', value: 'eliminate' },
				{ text: '隐藏', value: 'hide' },
				{ text: '清除', value: 'remove' },
				{ text: '保护', value: 'protect' }
			]).
			addClass('measure')
		]);
		break;
	case 'colorization':
		render_options.push([
			'颜色',
			UI.colorPicker()
		]);
		break;
	}

	// 生成表格内容
	UI.tbody($filter.find('tbody'), render_options);
	return $filter;
}

// 将筛选器数据加载到 UI
function renderData($filter, filter) {
	filter = filter || getFilterFromUI($filter);
	// 所有条件的名称列表
	var keys = consts.normalKeys;

	$filter.
	find('.onoff').
	addClass(
		filter.enabled ? 'on' : 'off'
	);

	keys.forEach(function (key) {
		// 读取该条件的匹配方法和匹配规则
		var data = getData(filter, key);
		$filter.
		each(function () {
			$(this).
			find(
				'.' + key + '-options ' +
				'.matching-method'
			).
			val(data.matchingMethod);
		}).
		find('.' + key).
		val(data.rule);
	});

	$filter.
	find('.matching-logic').
	val(
		getMatchingLogic(filter)
	);

	$filter.
	find('.measure').
	val(filter.measure);

	setColor(filter, $filter);

	return $filter;
}

// 创建一个新的筛选器
function createFilter(filter) {
	filter.uid = getUID();
	filter = completeFilter(filter);

	// 渲染 UI
	var $filter = createFilterUI(filter);
	renderData(
		renderFilterUI(
			filter, $filter
		),
		filter
	);

	// 立即切换到这个筛选器
	$filter.
	find('h3').
	trigger('click');
}

// 使列表中的筛选器可以通过拖拽排序
function endraggable($filter) {
	var $body = $('body');
	$filter.find('h3').
	prop('draggable', true).
	on('drag', function (e) {
		// 标记被拖拽的筛选器为被拖拽的源
		$filter.addClass('drag-source');
		// 标记拖拽状态
		$body.addClass('drag-dragging');
	}).
	on('dragover', function (e) {
		// 当拖拽到源上面时, 禁止 drop
		if ($filter.hasClass('drag-source'))
			return;
		// 其他情况下通过阻止默认行为, 允许 drop 事件触发
		e.preventDefault();

		// 根据鼠标坐标确定 drop 后的摆放位置
		var pos = e.offsetY > this.clientHeight / 2;
		// 添加目标位置标记
		$filter.
		addClass('drag-active').
		removeClass(
			'drag-after drag-before'
		).
		addClass(
			pos ? 'drag-after' : 'drag-before'
		);
	}).
	on('drop', function (e) {
		if (e.dataTransfer.files.length) {
			e.preventDefault();
			return;
		}
		// 将拖拽源移动到目标位置
		$('.drag-source').
		insertAfter('.drag-after').
		insertBefore('.drag-before');
	}).
	on('dragleave drop', function (e) {
		// 拖拽结束或鼠标离开 drop 区域, 清除所有标记
		$filter.
		removeClass(
			'drag-active drag-after drag-before'
		);
	});
}

// 生成一个 UID
function getUID() {
	var settings = getSettings();
	var uid = settings.uid++;
	saveSettings(settings);
	return uid;
}

// 根据参数, 向元素添加 ID/类名 等属性
function processUIOptions($elem, options) {
	if (options) {
		options.className && $elem.addClass(options.className);
		options.id && $elem.prop('id', options.id);
	}
	return $elem;
}

// 将 16 进制颜色转换为由 0~255 组成的 RGB 格式颜色
function hex2rgb(hex) {
	var re = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
	hex = hex.toLowerCase();
	if (hex && re.test(hex)) {
		// 将形如 "#ABC" 的颜色补全为 "#AABBCC"
		if (hex.length === 4) {
			var new_hex = "#";
			for (var i = 1; i < 4; i += 1) {
				new_hex +=
					hex.slice(i, i + 1).
					concat(
						hex.slice(i, i + 1)
					);
			}
			hex = new_hex;
		}
		var rgb = [];
		for (var i = 1; i < 7; i += 2) {
			rgb.push(parseInt("0x" + hex.slice(i, i + 2)));
		}
		return rgb;
	}
	// 如果不能正确转换, 返回原值
	return hex;
}

// 将由 0~255 组成的 RGB 格式颜色转换为 16 进制颜色
function rgb2hex(rgb) {
	rgb = Array.isArray(rgb) ? rgb : [];
	return '#' + rgb.map(function (i) {
			return pad(i.toString(16));
		}).
		join('');
}

// 补0
function pad(str) {
	if (str.length < 2) {
		var len = 2 - str.length;
		for (var i = 0; i < len; i++) {
			str = '0' + str;
		}
	}
	return str;
}

$(window).
// 实现匹配规则输入框的自动伸缩
delegate(consts.optionTextInputSel, 'focusin', function (e) {
	$(this).
	parent('td').
	attr('colspan', 2).
	parents('tr').
	addClass('focus');
}).
delegate(consts.optionTextInputSel, 'focusout', function (e) {
	$(this).
	parent('td').
	removeAttr('colspan').
	parents('tr').
	removeClass('focus');
}).
// 开关
delegate('.onoff', 'click', function (e) {
	// 阻止冒泡, 避免因点击开关而触发筛选器的切换
	e.stopImmediatePropagation();
	var $onoff = $(this);
	var enabled = $onoff.hasClass('on');
	$onoff.
	removeClass('on off').
	addClass(
		enabled ? 'off' : 'on'
	);
}).
// 删除筛选器
delegate('.remove-filter', 'click', function (e) {
	var msg = '确定删除此筛选器?';
	if (! confirm(msg)) return;

	var $self = $(this).parents('li.filter');

	// 该筛选器被删除后将会切换到的筛选器
	var $another = $self.next('li.filter');
	$another = $another.length ?
		$another : $self.prev('li.filter');

	$self.
	// 等待动画结束
	bind(
		'transitionEnd webkitTransitionEnd',
		function (e) {
			if (e.propertyName !== 'height') return;
			e.stopImmediatePropagation();
			$self.remove();

			// 切换到另一个筛选器
			$another.
			find('h3').
			trigger('click');
		}
	).
	// 缩小
	css('height', '0');
}).
// 实现筛选器的点击切换
delegate(consts.flId + ' > li:not(.current) h3', 'click', function (e) {
	$(consts.flId + ' > li.current').
	removeClass('current');

	var self = this;
	// 把其他筛选器都折叠显示
	$(consts.flId + ' > li').each(function () {
		if (self === this) return;
		$(this).height(24);
	});

	$(this).
	parent('li.filter, #directions').
	each(function () {
		var $li = $(this);
		$li.height(
			$li.fullHeight()
		);
	}).
	addClass('current');
	updateAllTags();
}).
delegate('input.color-picker', 'change', function (e) {
	var $self = $(this);
	var filter = {
		bgColor: hex2rgb($self.val())
	};
	var $filter = $self.parents('li.filter');
	// 最后一个参数可以避免连续触发 change 事件造成死循环
	setColor(filter, $filter, true);
}).
ready(function () {
	initColorPicker();
	initFiltersList();
	loadCommonSettings();
	bindEvents();

	var version = getVersion();
	$('#version').text(version);

	// 展开第一个筛选器
	$(consts.flId + ' > li:first-child h3').
	trigger('click');
}).
unload(function () {
	// 页面关闭时保存并应用设置
	$('.apply-settings').
	first().
	trigger('click');
});
