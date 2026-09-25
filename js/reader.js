/* Eva and the Digital Parrot — reader helpers. */

function updateDepth(book, newPage) {
	var page = newPage || book.turn('page'), pages = book.turn('pages');
	var scale = (book.data('readerLayout') || {scale: 1}).scale;
	var single = book.turn('display') === 'single';
	book.find('.p2').toggleClass('fixed', page >= 2);
	book.find('.p53').toggleClass('fixed', page < pages);
	book.find('.p2 .depth').css({
		width: single || page <= 3 ? 0 : 16 * scale * Math.min(1, page * 2 / pages),
		left: 4 * scale
	});
	book.find('.p53 .depth').css({
		width: single || page >= pages - 3 ? 0 : 16 * scale * Math.min(1, (pages - page) * 2 / pages),
		right: 4 * scale
	});
}

function loadPage(page) {
	$.ajax({url: 'pages/page' + page + '.html'}).done(function(pageHtml) {
		var content = $('<div class="page-content"></div>').html(pageHtml);
		if (content.find('img').length) content.addClass('has-art');
		$('.sj-book').data().pageObjs[page].empty().append(content);
	});
}

function addPage(page, book) {
	if (book.turn('hasPage', page)) return;
	var layout = book.data('readerLayout') || getReaderLayout();
	var element = $('<div class="own-size"><div class="loader"></div></div>').css({
		width: layout.display === 'single' ? layout.width : 460 * layout.scale,
		height: layout.display === 'single' ? layout.height : 582 * layout.scale
	});
	if (book.turn('addPage', element, page)) loadPage(page);
}

// The slider always selects the original 28 spreads, even in single-page mode.
function numberOfViews(book) { return Math.floor(book.turn('pages') / 2) + 1; }
function getViewNumber(book, page) { return Math.floor((page || book.turn('page')) / 2) + 1; }
function pageForView(view) { return Math.max(1, Math.min(54, view * 2 - 2)); }
function pageFromHash() {
	var match = /^#page\/(\d+)$/.exec(window.location.hash);
	return match ? Math.max(1, Math.min(54, parseInt(match[1], 10))) : 1;
}

// Covers, front matter, illustrations 6–48, blank end matter, inside back, back cover.
var spreadThumbnails = [
	'FrontCover', 'FrontCover', 'FrontCover',
	'Page6', 'Page8', 'Page10', 'Page12', 'Page14', 'Page16', 'Page18',
	'Page20', 'Page22', 'Page24', 'Page26', 'Page28', 'Page30', 'Page32',
	'Page34', 'Page36', 'Page38', 'Page40', 'Page42', 'Page44', 'Page46', 'Page48',
	'Page48', 'Page53', 'BackCover'
];

function spreadLabel(view) {
	if (view === 1) return 'Front cover';
	if (view === 28) return 'Back cover';
	return 'Pages ' + pageForView(view) + ' and ' + (pageForView(view) + 1);
}

function updateSliderLabel(view) {
	$('#slider .ui-slider-handle').attr({'aria-valuenow': view, 'aria-valuetext': spreadLabel(view)});
}

function setPreview(view) {
	view = Math.max(1, Math.min(28, Math.round(view)));
	var preview = $('#slider-preview'), bar = $('#slider-bar'), track = $('#slider');
	preview.find('img').attr('src', 'pics/thumbnails/' + spreadThumbnails[view - 1] + '.webp');
	// Clamp the preview within the slider area, including its first/last stops.
	var center = track.position().left + (view - 1) / 27 * track.width();
	var half = preview.outerWidth() / 2;
	preview.css('left', Math.max(half, Math.min(bar.width() - half, center))).addClass('show');
	updateSliderLabel(view);
}

function hidePreview() { $('#slider-preview').removeClass('show'); }

function updateNavigation(book, page) {
	page = page || book.turn('page');
	var view = book.turn('view', page);
	$('#previous-page').prop('disabled', $.inArray(1, view) !== -1);
	$('#next-page').prop('disabled', $.inArray(book.turn('pages'), view) !== -1);
	var sliderView = getViewNumber(book, page);
	$('#slider').slider('value', sliderView);
	updateSliderLabel(sliderView);
}

// jQuery UI 1.8 handles mouse/keyboard; this small adapter adds touch to the same slider.
function setupSliderTouch(book) {
	var bar = document.getElementById('slider-bar'), active = false;
	function move(touch) {
		var rect = document.getElementById('slider').getBoundingClientRect();
		var view = Math.max(1, Math.min(28, Math.round((touch.clientX - rect.left) / rect.width * 27) + 1));
		$('#slider').slider('value', view);
		setPreview(view);
	}
	bar.addEventListener('touchstart', function(event) {
		if (event.touches.length !== 1) {
			if (active) { active = false; hidePreview(); updateNavigation(book); }
			return;
		}
		active = true;
		event.preventDefault();
		move(event.touches[0]);
	}, {passive: false});
	bar.addEventListener('touchmove', function(event) {
		if (!active) return;
		if (event.touches.length !== 1) { active = false; hidePreview(); updateNavigation(book); return; }
		event.preventDefault();
		move(event.touches[0]);
	}, {passive: false});
	bar.addEventListener('touchend', function(event) {
		if (!active) return;
		active = false;
		event.preventDefault();
		book.turn('page', pageForView($('#slider').slider('value')));
		hidePreview();
	}, {passive: false});
	bar.addEventListener('touchcancel', function() {
		active = false;
		hidePreview();
		updateNavigation(book);
	});
}

function getReaderLayout() {
	var width = window.innerWidth, height = window.innerHeight;
	var single = width < 900 || height < 560;
	var bookWidth = single ? Math.min(480, width - 32) : Math.min(960, width - 128, (height - 144) * 1.6);
	bookWidth = Math.max(240, Math.floor(bookWidth));
	return {
		display: single ? 'single' : 'double',
		width: bookWidth,
		// Short landscape screens scroll vertically instead of shrinking text to illegibility.
		height: single ? Math.max(Math.round(bookWidth * 1.25), Math.min(700, Math.max(600, height - 144))) : Math.round(bookWidth / 1.6),
		scale: single ? 1 : bookWidth / 960
	};
}

function applyReaderLayout(layout) {
	var book = $('.sj-book');
	book.data('readerLayout', layout);
	$('#canvas').toggleClass('single-page', layout.display === 'single').css('width', layout.width);
	var canvasStyle = document.getElementById('canvas').style;
	canvasStyle.setProperty('--book-height', layout.height + 'px');
	canvasStyle.setProperty('--page-scale', layout.scale);
	$('#book-zoom').css({width: layout.width, height: layout.height});
	book.children('.own-size').css({
		width: layout.display === 'single' ? layout.width : 460 * layout.scale,
		height: layout.display === 'single' ? layout.height : 582 * layout.scale
	});
}

function resizeReader() {
	var book = $('.sj-book');
	if (!book.turn('is')) return;
	var requestedPage = pageFromHash();
	book.turn('stop');
	// Double-page turns settle on the even page internally. Keep an odd deep link
	// when it belongs to that spread before changing the display mode.
	var page = $.inArray(requestedPage, book.turn('view')) !== -1 ? requestedPage : book.turn('page');
	var layout = getReaderLayout();
	book.turn('page', page);
	applyReaderLayout(layout);
	if (book.turn('display') !== layout.display) book.turn('display', layout.display);
	// Turn.js caches detached pages too; resize those before its own-size calculation.
	$.each(book.data().pageObjs, function(number, element) {
		if (element.hasClass('own-size')) element.css({
			width: layout.display === 'single' ? layout.width : 460 * layout.scale,
			height: layout.display === 'single' ? layout.height : 582 * layout.scale
		});
	});
	book.turn('size', layout.width, layout.height).turn('page', page).turn('center');
	updateDepth(book);
	updateNavigation(book);
	hidePreview();
}

function isChrome() {
	// Keep the existing Turn.js acceleration choice.
	return navigator.userAgent.indexOf('Chrome') !== -1;
}
