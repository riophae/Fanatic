// 使 localStorage 可以存储和读取 JSON
var lspt = localStorage.constructor.prototype;
lspt.setData = function (key, data) {
	this.setItem(key, JSON.stringify(data));
}
lspt.getData = function (key) {
	var data = null;
	try {
		data = JSON.parse(this.getItem(key));
	} catch (e) { }
	return data;
}

// 全局常量
var consts = {
	stKey: 'fanatic_settings',
	processedAttr: 'fanatic-processed',
	analysedAttr: 'fanatic-analysed',
	hiddenAttr: 'fanatic-hidden',
	idPrefix: 'fanatic-',
	// 可供过滤的条件名称
	filterBys: [
		'id', 'username', 'content', 'client',
		'replyUsername', 'repostUsername',
		'mentionedIds', 'mentionedUsernames'
	],
	// 筛选器的部分参数名称列表 (暂时同上)
	normalKeys: [
		'id', 'username', 'content', 'client',
		'replyUsername', 'repostUsername',
		'mentionedIds', 'mentionedUsernames'
	]
};

// 获取版本号
function getVersion() {
	var ext_config = chrome.app.getDetails();
	var version = ext_config.version;
	return version;
}

// 深度糅合对象
function mixin(to, from) {
	for (var key in from) {
		if (! from.hasOwnProperty(key)) continue;
		if (from[key] instanceof Array) {
			if (typeof to[key] == 'object') {
				to[key] = to[key] instanceof Array && to[key].length ?
					to[key].concat(mixin([], from[key])) : mixin(to[key], from[key]);
			} else {
				to[key] = from[key].map(function(item) {
					if (item instanceof Array)
						return mixin([], item);
					if (item instanceof Object)
						return mixin({}, item);
					return item;
				});
			}
		}
		else if (from[key] instanceof Object) {
			to[key] = mixin(typeof to[key] == 'object' ? to[key] : {}, from[key]);
		}
		else {
			to[key] = from[key];
		}
	}
	return to;
}

// 在字符串中查找某个子字符串, 并返回其前/后字符串
// 未找到则返回原字符串
function searchStr(str, dir, patt) {
	var index = str.indexOf(patt);
	if (index === -1)
		return str;
	return dir == 'after' ?
			str.slice(index + patt.length) : str.slice(0, index);
}

// 将 Array 的 forEach 方法应用到所有 ArrayLike 对象
function forEach(array, func, context) {
	return Array.prototype.forEach.call(array, func, context);
}

// 对象遍历方法
function forIn(object, func, context) {
	var key;
	for (key in object) {
		if (object.hasOwnProperty(key)) {
			func.call(context, object[key], key, object);
		}
	}
}

// 参数糅合
function curry(func) {
	// 第一个参数为原有的函数
	// 所有其他参数将传入该函数
	var slice = Array.prototype.slice;
	var args = slice.call(arguments, 1);
	return function () {
		// 将新传入的参数与 args 糅合在一起一并传入 func
		return func.apply(this,
			args.concat(slice.call(arguments, 0)));
	}
}

// 避免某一函数在一段时间内被连续频繁调用
function throttle(func, delay) {
	var timeout, context, args;
	return function() {
		context = this;
		args = arguments;
		clearTimeout(timeout);
		timeout = setTimeout(function() {
			func.apply(context, args);
		}, delay);
	}
}