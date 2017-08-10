// alias preact's hyperscript reviver since it's referenced a lot:
var h = preact.h;

function createClass(obj) {
  // sub-class Component:
  function F(){ preact.Component.call(this); }
  var p = F.prototype = new preact.Component;
  // copy our skeleton into the prototype:
  for (var i in obj) {
    if (i === 'getDefaultProps' && typeof obj.getDefaultProps === 'function') {
      F.defaultProps = obj.getDefaultProps() || {};
    } else {
      p[i] = obj[i];
    }
  }
  // restore constructor:
  return p.constructor = F;
}

function loadJSON(path, success, error) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function()
  {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        if (success)
          success(JSON.parse(xhr.responseText));
      } else {
        if (error)
          error(xhr);
      }
    }
  };
  xhr.open("GET", path, true);
  xhr.send();
}

// -------------------------------------------------------------------------- //

function take(n, arr) {
  if (arr.length <= n) { return arr; }
  return arr.slice(0, n);
}

var App = createClass({
  componentWillMount: function() {
    var self = this;
    self.setState({
      searchString: '',
      isVisible: false,
      expanded: {},
      activeLinkIndex: -1,
      moduleResults: []
    });
    loadJSON("doc-index.json", function(data) {
      self.setState({
        fuse: new Fuse(data, {
          threshold: 0.4,
          caseSensitive: true,
          includeScore: true,
          keys: ["name"]
        }),
        moduleResults: []
      });
    }, function (err) {
      if (console) {
        console.error("could not load 'doc-index.json' for searching", err);
      }
      self.setState({ failedLoading: true });
    });

    document.addEventListener('mousedown', this.hide.bind(this));

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { self.hide(); }

      if (self.state.isVisible) {
        if (e.key === 'ArrowUp')   { self.navigateLinks(-1); e.preventDefault(); }
        if (e.key === 'ArrowDown') { self.navigateLinks(+1); e.preventDefault(); }
        if (e.key === 'Enter' && self.state.activeLinkIndex) {
          self.followActiveLink();
        }
      }

      if (e.key === 's' && e.target.tagName.toLowerCase() !== 'input') {
        if (self.input) {
          self.input.focus();
          e.preventDefault();
        }
      }
    })
  },

  hide: function() {
    this.setState({ isVisible: false });
  },

  show: function() {
    if (!this.state.isVisible) {
      this.setState({ isVisible: true, activeLinkIndex: -1 });
    }
  },

  navigateLinks: function(change) {
    var newActiveLinkIndex = Math.max(-1, Math.min(this.linkIndex-1, this.state.activeLinkIndex + change));
    this.setState({ activeLinkIndex: newActiveLinkIndex });
  },

  followActiveLink: function() {
    if (!this.activeLinkAction) { return; }
    this.activeLinkAction();
  },

  updateResults: function() {
    var searchString = this.input.value;
    var results = this.state.fuse.search(searchString)

    var resultsByModule = {};

    results.forEach(function(result) {
      var moduleName = result.item.module;
      var resultsInModule = resultsByModule[moduleName] || (resultsByModule[moduleName] = []);
      resultsInModule.push(result);
    });

    var moduleResults = [];
    for (var moduleName in resultsByModule) {
      var items = resultsByModule[moduleName];
      var sumOfInverseScores = 0;
      items.forEach(function(item) { sumOfInverseScores += 1/item.score; });
      moduleResults.push({ module: moduleName, totalScore: 1/sumOfInverseScores, items: items });
    }

    moduleResults.sort(function(a, b) { return a.totalScore - b.totalScore; });

    this.setState({ searchString: searchString, isVisible: true, moduleResults: moduleResults });
  },

  render: function(props, state) {
    if (state.failedLoading) { return null; }

    var self = this;
    this.linkIndex = 0;

    var onMouseOver = function(e) {
      var target = e.relatedTarget;
      if (!target) { return; }
      if (target.hasAttribute('data-link-index')) {
        var linkIndex = parseInt(target.getAttribute('data-link-index'), 10);
        this.setState({ activeLinkIndex: linkIndex });
      }
    }.bind(this);

    var items = take(10, state.moduleResults).map(this.renderResultsInModule.bind(this));
    var stopPropagation = function(e) { e.stopPropagation(); };
    return (
      h('div', { id: 'search', onMouseDown: stopPropagation, onMouseOver: onMouseOver },
        h('div', { id: 'search-form' },
          h('input', {
            placeholder: "Search in package by name",
            ref: function(input) { self.input = input; },
            onFocus: this.show.bind(this),
            onClick: this.show.bind(this),
            onInput: this.updateResults.bind(this)
          }),
        ),
        !state.isVisible
          ? null
          : h('div', { id: 'search-results' },
              state.searchString === ''
                ? h(IntroMsg)
                :    items.length == 0
                      ? h(NoResultsMsg, { searchString: state.searchString })
                      : h('ul', null, items)
            )
      )
    );
  },

  renderResultsInModule: function(resultsInModule) {
    var items = resultsInModule.items;
    var moduleName = resultsInModule.module;
    var showAll = this.state.expanded[moduleName] || items.length <= 10;
    var visibleItems = showAll ? items : take(8, items);

    var expand = function() {
      var newExpanded = Object.assign({}, this.state.expanded);
      newExpanded[moduleName] = true;
      this.setState({ expanded: newExpanded });
    }.bind(this);

    var renderItem = function(item) {
      return h('li', { class: 'search-result' },
        this.navigationLink('#TODO', {},
          h('div', {dangerouslySetInnerHTML: {__html: item.display_html}})
        )
      );
    }.bind(this);

    return h('li', { class: 'search-module' },
      h('h4', null, moduleName),
      h('ul', null,
        visibleItems.map(function(item) { return renderItem(item.item); }),
        showAll
          ? null
          : h('li', { class: 'more-results' },
              this.actionLink(expand, {}, "(show " + (items.length - visibleItems.length) + " more results from this module)")
            )
      ),
    )
  },

  navigationLink: function(href, attrs) {
    var fullAttrs = Object.assign({ href: href }, attrs);
    var action = function() { window.location.href = href; };
    var args = [fullAttrs, action].concat(Array.prototype.slice.call(arguments, 2));
    return this.menuLink.apply(this, args);
  },

  actionLink: function(callback, attrs) {
    var onClick = function(e) { e.preventDefault(); callback(); }
    var fullAttrs = Object.assign({ href: '#', onClick: onClick }, attrs);
    var args = [fullAttrs, callback].concat(Array.prototype.slice.call(arguments, 2));
    return this.menuLink.apply(this, args);
  },

  menuLink: function(attrs, action) {
    var children = Array.prototype.slice.call(arguments, 2);
    var linkIndex = this.linkIndex;
    if (linkIndex === this.state.activeLinkIndex) {
      attrs['class'] = (attrs['class'] ? attrs['class'] + ' ' : '') + 'active-link';
      this.activeLinkAction = action;
    }
    var newAttrs = Object.assign({ 'data-link-index': linkIndex }, attrs);
    var args = ['a', newAttrs].concat(children);
    this.linkIndex += 1;
    return h.apply(null, args);
  }

});

var IntroMsg = function() {
  return h('p', null,
    "You can find any exported type, constructor, class, function or pattern defined in this package by (approximate) name. Press ",
    h('span', { class: 'key' }, "s"),
    " to bring up this search box. You can navigate using ",
    h('span', { class: 'key' }, "↓"),
    " and ",
    h('span', { class: 'key' }, "↑"),
    " and go to an active result by pressing ",
    h('span', { class: 'key' }, "↵"),
    "."
  );
};

var NoResultsMsg = function(props) {
  var messages = [
    h('p', null,
      "Your search for '" + props.searchString + "' produced the following list of results: ",
      h('code', null, '[]'),
      "."
    ),
    h('p', null,
      h('code', null, 'Nothing'),
      " matches your query for '" + props.searchString + "'.",
    ),
    h('p', null,
      h('code', null, 'Left "no matches for \'' + props.searchString + '\'" :: Either String (NonEmpty SearchResult)'),
    )
  ];

  return messages[(props.searchString || 'a').charCodeAt(0) % messages.length];
};

preact.render(h(App), document.body);
