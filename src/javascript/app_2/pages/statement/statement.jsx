import React from 'react';
import moment from 'moment';
import Client from '../../../app/base/client';
import DAO from '../../data/dao';
import { connect } from '../../store/connect';
import { toJapanTimeIfNeeded } from '../../../app/base/clock';
import { jpClient } from '../../../app/common/country_base';
import { formatMoney } from '../../../app/common/currency';
// import { addTooltip, buildOauthApps, showTooltip } from '../../../app/common/get_app_details';
import { localize } from '../../../_common/localize';
import { toTitleCase } from '../../../_common/string_util';
import { throttlebounce } from '../../../_common/utility';
import DataTable from '../../components/elements/data_table.jsx';
import DatePicker from '../../components/form/date_picker.jsx';
import Loading from '../../../../templates/_common/components/loading.jsx';

/* TODO:
      1. to separate logic from UI
      3. to handle errors
*/
const getStatementData = (statement, currency, is_jp_client) => {
    const date_obj   = new Date(statement.transaction_time * 1000);
    const moment_obj = moment.utc(date_obj);
    const date_str   = moment_obj.format('YYYY-MM-DD');
    const time_str   = `${moment_obj.format('HH:mm:ss')} GMT`;
    const payout     = parseFloat(statement.payout);
    const amount     = parseFloat(statement.amount);
    const balance    = parseFloat(statement.balance_after);

    return {
        action : localize(toTitleCase(statement.action_type)),
        date   : is_jp_client ? toJapanTimeIfNeeded(+statement.transaction_time) : `${date_str}\n${time_str}`,
        ref    : statement.transaction_id,
        payout : isNaN(payout)  ? '-' : formatMoney(currency, payout,  !is_jp_client),
        amount : isNaN(amount)  ? '-' : formatMoney(currency, amount,  !is_jp_client),
        balance: isNaN(balance) ? '-' : formatMoney(currency, balance, !is_jp_client),
        desc   : localize(statement.longcode.replace(/\n/g, '<br />')),
        id     : statement.contract_id,
        app_id : statement.app_id,
    };
};

class Statement extends React.PureComponent {
    constructor(props) {
        super(props);

        this.handleScroll     = this.handleScroll.bind(this);
        this.handleDateChange = this.handleDateChange.bind(this);
        this.loadNextChunk    = this.loadNextChunk.bind(this);
        this.fetchNextBatch   = this.fetchNextBatch.bind(this);
        this.reloadTable      = this.reloadTable.bind(this);

        const columns = [
            {
                title     : localize('Date'),
                data_index: 'date',
            },
            {
                title     : localize('Ref.'),
                data_index: 'ref',
                // TODO: add data balloon later
                // renderCell: (data, data_index, transaction) => {
                //     return (
                //         <td key={data_index} className={data_index}>
                //             <span
                //                 data-balloon={transaction.app_id}
                //             >{data}</span>
                //         </td>
                //     );
                // },
            },
            {
                title     : localize('Description'),
                data_index: 'desc',
            },
            {
                title     : localize('Action'),
                data_index: 'action',
            },
            {
                title     : localize('Potential Payout'),
                data_index: 'payout',
            },
            {
                title     : localize('Credit/Debit'),
                data_index: 'amount',
                renderCell: (data, data_index) => {
                    const parseStrNum = (str) => parseFloat(str.replace(',', '.'));
                    return (
                        <td
                            key={data_index}
                            className={`${data_index} ${(parseStrNum(data) >= 0) ? 'profit' : 'loss'}`}
                        >
                            {data}
                        </td>
                    );
                },
            },
            {
                title     : localize('Balance'),
                data_index: 'balance',
            },
        ];

        this.state = {
            columns,
            data_source    : [],
            pending_request: false,
            has_loaded_all : false,
            chunks         : 1,
            date_from      : '',
            date_to        : '',
        };
    }

    componentDidMount() {
        // BinarySocket.send({ oauth_apps: 1 }).then((response) => {
        //     this.oauth_apps = buildOauthApps(response);
        //     console.log(this.oauth_apps);
        // });

        this.fetchNextBatch();

        this._throttledHandleScroll = throttlebounce(this.handleScroll, 200);
        window.addEventListener('scroll', this._throttledHandleScroll, false);
    }

    componentWillUnmount() {
        window.removeEventListener('scroll', this._throttledHandleScroll, false);
    }

    handleScroll() {
        const {scrollTop, scrollHeight, clientHeight} = document.scrollingElement;
        const left_to_scroll = scrollHeight - (scrollTop + clientHeight);

        if (left_to_scroll < 1000) {
            this.loadNextChunk();
        }
    }

    handleDateChange(e) {
        if (e.target.value !== this.state[e.target.name]) {
            this.reloadTable();
        }
        this.setState({
            [e.target.name]: e.target.value,
        });
    }

    loadNextChunk() {
        const { chunk_size } = this.props;
        const { chunks, data_source } = this.state;

        if (data_source.length <= chunks * chunk_size) {
            // all content is shown
            return;
        }

        this.setState({ chunks: chunks + 1 });

        if (data_source.length <= (chunks + 1) * chunk_size) {
            // last chunk has been loaded
            this.fetchNextBatch();
        }
    }

    fetchNextBatch() {
        if (this.state.has_loaded_all || this.state.pending_request) return;

        this.setState({ pending_request: true });

        const currency     = Client.get('currency');
        const is_jp_client = jpClient();

        const { date_from, date_to } = this.state;

        DAO.getStatement(
            this.props.batch_size,
            this.state.data_source.length,
            {
                ...date_from && {date_from: moment(date_from).unix()},
                ...date_to   && {date_to: moment(date_to).add(1, 'd').subtract(1, 's').unix()},
            }
        ).then((response) => {
            const formatted_transactions = response.statement.transactions
                .map(transaction => getStatementData(transaction, currency, is_jp_client));

            this.setState({
                data_source    : [...this.state.data_source, ...formatted_transactions],
                has_loaded_all : formatted_transactions.length < this.props.batch_size,
                pending_request: false,
            });
        });
    }

    reloadTable() {
        this.setState(
            {
                data_source    : [],
                has_loaded_all : false,
                pending_request: false,
                chunks         : 1,
            },
            this.fetchNextBatch
        );
    }

    render() {
        const is_loading = this.state.pending_request && this.state.data_source.length === 0;

        const moment_now = moment(this.props.server_time);
        const today = moment_now.format('YYYY-MM-DD');

        return (
            <div className='statement-container'>
                <div className='statement-filter'>
                    <div className='container'>
                        <span className='statement-filter-text'>{localize('Filter by date:')}</span>
                        <span className='statement-filter-text'>{localize('from')}</span>
                        <DatePicker
                            name='date_from'
                            initial_value=''
                            startDate={moment_now.clone().subtract(30, 'd').format('YYYY-MM-DD')}
                            maxDate={this.state.date_to || today}
                            onChange={this.handleDateChange}
                        />
                        <span className='statement-filter-text'>{localize('to')}</span>
                        <DatePicker
                            name='date_to'
                            initial_value=''
                            startDate={today}
                            minDate={this.state.date_from}
                            maxDate={today}
                            showTodayBtn
                            onChange={this.handleDateChange}
                        />
                    </div>
                </div>
                <div className='statement-content'>
                    {
                        is_loading
                            && (
                                <React.Fragment>
                                    <DataTable
                                        data_source={[]}
                                        columns={this.state.columns}
                                        has_fixed_header
                                        is_full_width
                                    />
                                    <Loading />
                                </React.Fragment>
                            )

                        ||

                        this.state.data_source.length === 0
                            && (
                                <React.Fragment>
                                    <DataTable
                                        data_source={[]}
                                        columns={this.state.columns}
                                        has_fixed_header
                                        is_full_width
                                    />
                                    <div className='statement-no-activity-msg'>
                                        {
                                            !this.state.date_from && !this.state.date_to
                                                ? localize('Your account has no trading activity.')
                                                : localize('Your account has no trading activity for the selected period.')
                                        }
                                    </div>
                                </React.Fragment>
                            )

                        ||

                        <DataTable
                            data_source={this.state.data_source.slice(
                                0,
                                this.state.chunks * this.props.chunk_size
                            )}
                            columns={this.state.columns}
                            has_fixed_header
                            is_full_width
                        />
                    }
                </div>
            </div>
        );
    }
}

Statement.defaultProps = {
    chunk_size: 50,  // display with chunks
    batch_size: 200, // request with batches
};

export default connect(
    ({trade}) => ({
        server_time: trade.server_time,
    })
)(Statement);
