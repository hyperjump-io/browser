/* eslint-disable */
/* global describe, it*/
/* jshint -W030*/
'use strict';
const url = require('url');

const nodeUrlResolve = url.resolve;
const thisUrlResolve = require('../index');
const TestCase = require('./TestCase');

const chai = require('chai');
const expect = chai.expect;

describe('url resolve test', function () {
  const tests = [
    new TestCase(
      '',
      'about:robots',
      'about:robots'
    ),
    new TestCase(
      '',
      'http://test.com',
      'http://test.com/'
    ),
    new TestCase(
      'http://test.com/path?query#hash',
      '',
      'http://test.com/path?query'
    ),
    new TestCase(
      'http://test.com',
      'http://relative.com',
      'http://relative.com/'
    ),
    new TestCase(
      'http://test.com/with/a/path',
      '/absolute/path',
      'http://test.com/absolute/path'
    ),
    new TestCase(
      'http://test.com/example/path/index.html',
      'relative/path',
      'http://test.com/example/path/relative/path'
    ),
    new TestCase(
      'http://test.com/path/',
      'other/path',
      'http://test.com/path/other/path'
    ),
    new TestCase(
      '  http://test.com?query#hash    ',
      '   path?query#hash',
      'http://test.com/path?query#hash'
    ),
    new TestCase(
      'http://nah.com',
      'http://test.com/path/file.html',
      'http://test.com/path/file.html'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-template/index.html',
      './assets/images/icons/apple-touch-icon-114-precomposed.png',
      'https://agileui.com/demo/monarch/demo/admin-template/assets/images/icons/apple-touch-icon-114-precomposed.png'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-template/index.html',
      '../assets/images/icons/apple-touch-icon-114-precomposed.png',
      'https://agileui.com/demo/monarch/demo/assets/images/icons/apple-touch-icon-114-precomposed.png'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-template/index.html',
      '../../assets/images/icons/apple-touch-icon-114-precomposed.png',
      'https://agileui.com/demo/monarch/assets/images/icons/apple-touch-icon-114-precomposed.png'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-template/index.html',
      '../../assets/images/../images/icons/apple-touch-icon-114-precomposed.png',
      'https://agileui.com/demo/monarch/assets/images/icons/apple-touch-icon-114-precomposed.png'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-angular/index.html#/',
      '#test',
      'https://agileui.com/demo/monarch/demo/admin-angular/index.html#test'
    ),
    new TestCase(
      'https://agileui.com/demo/monarch/demo/admin-angular/index.html#/',
      '../../assets/image-resources/gravatar.jpg',
      'https://agileui.com/demo/monarch/assets/image-resources/gravatar.jpg'
    ),
    new TestCase(
      'https://twitch.tv',
      '//web-cdn.twnv.net/assets/application.css',
      'https://web-cdn.twnv.net/assets/application.css'
    ),
    new TestCase(
      'http://example.com/aaa#/foo/',
      '#/foo//bar',
      'http://example.com/aaa#/foo//bar'
    ),
    new TestCase(
      'http://example.com/aaa',
      '?url=/foo//bar',
      'http://example.com/aaa?url=/foo//bar'
    ),
    new TestCase(
      'http://example.com/aaa',
      '/a//b',
      'http://example.com/a/b'
    ),
    new TestCase(
      'http://example.com/aaa/bbb',
      'a//b',
      'http://example.com/aaa/a/b'
    ),
    new TestCase(
      'http://example.com/aaa',
      '?url=http://foo.com/bar',
      'http://example.com/aaa?url=http://foo.com/bar'
    )
  ];

  it('should have the same outputs as node.js\' url.resolve.', function () {
    const hrefs = [
      'http://example.com/',
      'http://nodejs.org/docs/latest/api/url.html#url_url_format_urlobj',
      'http://blog.nodejs.org',
      'https://encrypted.google.com/search?q=url&q=site:npmjs.org&hl=en',
    ];

    const paths = [
      'foo/bar',
      'http://nodejs.org',
      '/foo/bar?baz',
      ''
    ];
    for (let i = 0; i < hrefs.length; i++) {
      for(let j = 0; j < paths.length; j++) {
        const thisResult = thisUrlResolve(hrefs[i], paths[j]);
        const nodeResult = nodeUrlResolve(hrefs[i], paths[j]);
        expect(thisResult).to.equal(nodeResult);
      }
    }
  });

  it('should throw error if the first argument is not a net path', function () {
    expect(thisUrlResolve.bind(undefined,'#yolo', '/foo/bar')).to.throw(Error);
    expect(thisUrlResolve.bind(undefined, 'http:/nope.com', '')).to.throw(Error);
  });

  tests.forEach((testCase) => {
    let {base, relative, expectedResult} = testCase;
    let testDescription = `should resolve base url: ${base}\n` +
      `    with relative url: ${relative}\n` +
      `    to ${expectedResult}`;

    it(testDescription, () => {
      expect(testCase.getActualResult()).to.equal(expectedResult);
    });
  });
});
