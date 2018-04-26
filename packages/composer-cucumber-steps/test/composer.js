/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Composer = require('../lib/composer');
const Cucumber = require('cucumber');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

/**
 * Programmatically execute Cucumber against the specified feature source.
 * @param {string} featureSource The feature source.
 * @return {Promise} A promise that is resolved when complete, or rejected with an
 * error.
 */
function runCucumberTest (featureSource) {
    const feature = Cucumber.FeatureParser.parse({
        scenarioFilter : new Cucumber.ScenarioFilter({}),
        source : featureSource,
        uri : path.resolve(__dirname, '..', 'features', 'test.feature')
    });

    // Load the support functions.
    Cucumber.clearSupportCodeFns();
    Cucumber.defineSupportCode((context) => {
        require('..').call(context);
    });
    const supportCodeLibrary = Cucumber.SupportCodeLibraryBuilder.build({
        cwd : '/',
        fns : Cucumber.getSupportCodeFns()
    });
    const formatterOptions = {
        colorsEnabled : true,
        cwd : '/',
        log : (data) => {
         //   console.log(data);  // uncomment this line to get detailed output for each test
        },
        supportCodeLibrary : supportCodeLibrary
    };

    const prettyFormatter = Cucumber.FormatterBuilder.build('pretty', formatterOptions);

    const runtime = new Cucumber.Runtime({
        features : [feature],
        listeners : [prettyFormatter],
        supportCodeLibrary : supportCodeLibrary
    });
    return runtime.start();
}

describe('Cucumber', () => {

    describe('error handling', () => {

        it('should rethrow any errors if errors are not expected', () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    When I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
            `;
            return runCucumberTest(featureSource)
                .should.eventually.be.false;
        });

        it('should handle any errors if errors are expected', async () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    When I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    Then I should get an error
            `;

            let result = await runCucumberTest(featureSource);
            return result.should.be.true;

        });

        it('should throw if multiple errors are caught when errors are expected', () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    When I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    And I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    Then I should get an error
            `;
            return runCucumberTest(featureSource)
                .should.eventually.be.false;
        });

        it('should throw if errors are expected but none are thrown', () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    Then I should get an error
            `;
            return runCucumberTest(featureSource)
                .should.eventually.be.false;
        });

        it('should handle any errors that are expected and match the regular expression', () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    When I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    Then I should get an error matching /.*/
            `;
            return runCucumberTest(featureSource)
                .should.eventually.be.true;
        });

        it('should throw if errors are expected but they do not match the regular expression', () => {
            const featureSource = `
            Feature: test
                Background:
                    Given I have deployed the business network archive basic-sample-network.bna
                Scenario: test
                    Given I have added the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    When I add the following asset of type org.acme.sample.SampleAsset
                        | assetId | owner           | value |
                        | 1       | alice@email.com | 10    |
                    Then I should get an error matching /blah blah blah/
            `;
            return runCucumberTest(featureSource)
                .should.eventually.be.false;
        });

    });

    describe('#convertValueToType', () => {

        it('should handle boolean values', () => {
            const composer = new Composer();
            composer.convertValueToType('false', 'Boolean').should.be.false;
            composer.convertValueToType('true', 'Boolean').should.be.true;
            (() => {
                composer.convertValueToType('blah', 'Boolean');
            }).should.throw(/Invalid value "blah" for type "Boolean"/);
        });

        it('should handle date values', () => {
            const composer = new Composer();
            composer.convertValueToType('2018-04-20T15:06:37.919Z', 'DateTime').toISOString().should.equal('2018-04-20T15:06:37.919Z');
            (() => {
                composer.convertValueToType('blah', 'DateTime');
            }).should.throw(/Invalid value "blah" for type "DateTime"/);
        });

        it('should handle double values', () => {
            const composer = new Composer();
            composer.convertValueToType('3.142', 'Double').should.equal(3.142);
            (() => {
                composer.convertValueToType('blah', 'Double');
            }).should.throw(/Invalid value "blah" for type "Double"/);
        });

        it('should handle integer values', () => {
            const composer = new Composer();
            composer.convertValueToType('1234', 'Integer').should.equal(1234);
            (() => {
                composer.convertValueToType('blah', 'Integer');
            }).should.throw(/Invalid value "blah" for type "Integer"/);
        });

        it('should handle long values', () => {
            const composer = new Composer();
            composer.convertValueToType('12345678', 'Long').should.equal(12345678);
            (() => {
                composer.convertValueToType('blah', 'Long');
            }).should.throw(/Invalid value "blah" for type "Long"/);
        });

        it('should handle string values', () => {
            const composer = new Composer();
            composer.convertValueToType('12345678', 'String').should.equal('12345678');
        });

    });

});
