import React           from 'react';
import PropTypes       from 'prop-types';
import { localize }    from '_common/localize';
import Button          from 'App/Components/Form/button.jsx';
import { IconLock }    from 'Assets/Trading/icon_lock.jsx';

const PurchaseLock = ({ onClick }) => (
    <div className='purchase-container__lock'>
        <div>
            <IconLock className='purchase-container__lock-icon' />
        </div>
        <h4 className='purchase-container__lock-header'>{localize('Purchase Locked')}</h4>
        <Button
            className='purchase-container__lock-button flat secondary orange'
            has_effect
            onClick={onClick}
            text={localize('Unlock')}
        />
        <span className='purchase-container__lock-message'>
            {localize('You can lock/unlock the purchase button from the Settings menu')}
        </span>
    </div>
);

PurchaseLock.propTypes = {
    onClick: PropTypes.func,
};

export default PurchaseLock;
